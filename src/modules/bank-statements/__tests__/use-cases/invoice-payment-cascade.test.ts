import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import {
  GroupedSettlementPaymentCascadeWrite,
  InvoicePaymentCascadeWrite,
} from "../../adapters/out/invoice-payment-cascade.decorators.js";
import type { InvoicePaymentPort } from "../../domain/ports/out/invoice-payment.port.js";
import type { InvoiceMatchCandidate } from "../../domain/ports/out/invoice-match-read.port.js";
import type { GroupedSettlementLinkInput, GroupedSettlementWritePort } from "../../domain/ports/out/grouped-settlement-write.port.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import { FakeInvoiceReconciliationWrite } from "../fakes/fake-invoice-reconciliation-write.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";

// Dados fictícios.
const organizationId = mintOrganizationId("org-a");

class RecordingInvoicePayment implements InvoicePaymentPort {
  readonly settled: { invoiceId: string; paidAt: string; bankAccountId: string | null; paidByThisReconciliation: boolean }[] = [];
  readonly reopened: string[] = [];
  async settle(_org: OrganizationId, input: { invoiceId: string; paidAt: string; bankAccountId: string | null; paidByThisReconciliation: boolean }) {
    this.settled.push(input);
  }
  async reopen(_org: OrganizationId, invoiceId: string) {
    this.reopened.push(invoiceId);
  }
}

const invoice = (over: Partial<InvoiceMatchCandidate> = {}): InvoiceMatchCandidate => ({
  id: "inv-1",
  supplierId: "sup-1",
  supplierName: "Fornecedor Exemplo",
  invoiceNumber: "FT-001",
  totalWithVat: 12_300,
  invoiceDate: "2026-09-01",
  dueDate: "2026-09-30",
  paidAt: null,
  status: "pending",
  currency: "EUR",
  documentType: "invoice",
  reconciliationStatus: "pending_reconciliation",
  ...over,
});

describe("Conciliação → fatura paga em cadeia", () => {
  let invoiceRead: FakeInvoiceMatchRead;
  let base: FakeInvoiceReconciliationWrite;
  let payment: RecordingInvoicePayment;
  let write: InvoicePaymentCascadeWrite;

  beforeEach(() => {
    invoiceRead = new FakeInvoiceMatchRead();
    base = new FakeInvoiceReconciliationWrite();
    payment = new RecordingInvoicePayment();
    write = new InvoicePaymentCascadeWrite(base, invoiceRead, payment);
  });

  it("conciliada por inteiro → paga pela conciliação, com a data e a conta do movimento", async () => {
    invoiceRead.setcandidates(organizationId, [invoice()]);
    await write.markReconciled(organizationId, "inv-1", new Date("2026-09-10T00:00:00.000Z"), "acc-1");
    expect(base.reconciledCalls).toHaveLength(1);
    expect(payment.settled).toEqual([{ invoiceId: "inv-1", paidAt: "2026-09-10", bankAccountId: "acc-1", paidByThisReconciliation: true }]);
  });

  it("já paga à mão → só sincroniza (não passa a «paga pela conciliação»)", async () => {
    invoiceRead.setcandidates(organizationId, [invoice({ status: "paid", paidAt: "2026-09-05" })]);
    await write.markReconciled(organizationId, "inv-1", new Date("2026-09-10T00:00:00.000Z"), "acc-1");
    expect(payment.settled[0]!.paidByThisReconciliation).toBe(false);
  });

  it("notas de crédito não pagam nada", async () => {
    invoiceRead.setcandidates(organizationId, [invoice({ documentType: "credit_note", totalWithVat: -1_000 })]);
    await write.markReconciled(organizationId, "inv-1", new Date("2026-09-10T00:00:00.000Z"), "acc-1");
    expect(payment.settled).toEqual([]);
  });

  it("anulada ou parcial → reabre (o módulo de faturas só desfaz o que a conciliação pagou)", async () => {
    await write.markUnreconciled(organizationId, "inv-1");
    await write.markPartiallyReconciled(organizationId, "inv-2");
    expect(base.unreconciledCalls).toEqual(["inv-1"]);
    expect(base.partialCalls).toEqual(["inv-2"]);
    expect(payment.reopened).toEqual(["inv-1", "inv-2"]);
  });
});

describe("Liquidação agrupada → faturas pagas em cadeia", () => {
  it("as que ficam conciliadas pagam; as que saem do movimento reabrem", async () => {
    const invoiceRead = new FakeInvoiceMatchRead();
    const movementRepo = new FakeBankMovementRepository();
    const linkRepo = new FakeBankMovementEntityLinkRepository();
    const payment = new RecordingInvoicePayment();
    const movement = BankMovement.create({
      bankAccountId: "acc-1",
      statementImportId: "stmt-1",
      bookingDate: new Date("2026-09-12T00:00:00.000Z"),
      valueDate: new Date("2026-09-12T00:00:00.000Z"),
      description: "PAG FORNECEDOR EXEMPLO",
      amount: 20_000,
      balanceAfter: 0,
      movementType: "debit",
      deduplicationHash: "h-1",
    });
    await movementRepo.saveBulk(organizationId, [movement]);
    // O movimento já liquidava a inv-old; a nova seleção troca-a pela inv-a e pela inv-b.
    await linkRepo.saveAll(organizationId, [
      { id: "l-0", movementId: movement.id, entityType: "invoice", entityId: "inv-old", amountCents: 20_000, allocatedAmountCents: 20_000, entityLabel: "FT-old" },
    ]);
    invoiceRead.setcandidates(organizationId, [
      invoice({ id: "inv-old", status: "paid", paidAt: "2026-09-12", reconciliationStatus: "reconciled" }),
      invoice({ id: "inv-a" }),
      invoice({ id: "inv-b", status: "paid", paidAt: "2026-09-01" }),
    ]);
    // Simula a função SQL: inv-a e inv-b ficam conciliadas (inv-a passa a paga), inv-old deixa de o estar.
    const base: GroupedSettlementWritePort = {
      async confirm(_org, _movementId, _links: GroupedSettlementLinkInput[]) {
        invoiceRead.setcandidates(organizationId, [
          invoice({ id: "inv-old", status: "paid", paidAt: "2026-09-12", reconciliationStatus: "pending_reconciliation" }),
          invoice({ id: "inv-a", status: "paid", paidAt: "2026-09-12", reconciliationStatus: "reconciled" }),
          invoice({ id: "inv-b", status: "paid", paidAt: "2026-09-01", reconciliationStatus: "reconciled" }),
        ]);
        return { reconciliationStatus: "conciliado_com_fatura" };
      },
    };

    const write = new GroupedSettlementPaymentCascadeWrite(base, invoiceRead, movementRepo, linkRepo, payment);
    await write.confirm(organizationId, movement.id, [
      { entityId: "inv-a", documentType: "invoice", allocatedAmountCents: 12_300, expectedOpenBalanceCents: 12_300 },
      { entityId: "inv-b", documentType: "invoice", allocatedAmountCents: 7_700, expectedOpenBalanceCents: 7_700 },
    ]);

    expect(payment.settled).toEqual([
      { invoiceId: "inv-a", paidAt: "2026-09-12", bankAccountId: "acc-1", paidByThisReconciliation: true },
      { invoiceId: "inv-b", paidAt: "2026-09-01", bankAccountId: "acc-1", paidByThisReconciliation: false },
    ]);
    expect(payment.reopened).toEqual(["inv-old"]);
  });
});
