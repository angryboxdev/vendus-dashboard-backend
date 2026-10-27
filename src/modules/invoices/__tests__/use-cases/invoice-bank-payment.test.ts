import { MarkInvoicePaidUseCase } from "../../application/use-cases/mark-invoice-paid.use-case.js";
import {
  ReopenInvoiceFromBankUseCase,
  SettleInvoiceFromBankUseCase,
} from "../../application/use-cases/invoice-bank-payment.use-cases.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeOccurrenceSync } from "../fakes/fake-occurrence-sync.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

// Dados fictícios.
const ORG_ID = mintOrganizationId("org-test");

const makeInvoice = () =>
  Invoice.create({
    supplierName: "Fornecedor Exemplo",
    invoiceNumber: "FT-001",
    invoiceDate: new Date("2026-09-01"),
    subtotalWithoutVat: 10000,
    totalVat: 2300,
    totalWithVat: 12300,
  });

describe("Pagamento de faturas pela conciliação bancária", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let payableWrite: FakePayableEntryWrite;
  let occurrenceSync: FakeOccurrenceSync;
  let settle: SettleInvoiceFromBankUseCase;
  let reopen: ReopenInvoiceFromBankUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    payableWrite = new FakePayableEntryWrite();
    occurrenceSync = new FakeOccurrenceSync();
    settle = new SettleInvoiceFromBankUseCase(invoiceRepo, payableWrite, occurrenceSync);
    reopen = new ReopenInvoiceFromBankUseCase(invoiceRepo, payableWrite, occurrenceSync);
  });

  it("conciliada por inteiro → paga com a data do movimento; conta a pagar e ocorrência acompanham", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);
    await settle.execute({ organizationId: ORG_ID, invoiceId: inv.id, paidAt: "2026-09-10", bankAccountId: "acc-1", paidByThisReconciliation: true });

    const saved = (await invoiceRepo.findById(ORG_ID, inv.id))!;
    expect(saved.status).toBe("paid");
    expect(saved.paidAt!.toISOString().slice(0, 10)).toBe("2026-09-10");
    expect(saved.paymentBankAccountId).toBe("acc-1");
    expect(saved.isPaidByBank).toBe(true);
    expect(payableWrite.markedPaid.map((c) => c.invoiceId)).toEqual([inv.id]);
    expect(occurrenceSync.calls.map((c) => c.invoiceId)).toEqual([inv.id]);
  });

  it("anular a conciliação → volta a por pagar, com a conta a pagar e a ocorrência", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);
    await settle.execute({ organizationId: ORG_ID, invoiceId: inv.id, paidAt: "2026-09-10", bankAccountId: null, paidByThisReconciliation: true });

    expect(await reopen.execute({ organizationId: ORG_ID, invoiceId: inv.id })).toBe(true);
    const saved = (await invoiceRepo.findById(ORG_ID, inv.id))!;
    expect(saved.status).not.toBe("paid");
    expect(saved.paidAt).toBeNull();
    expect(payableWrite.reopened).toEqual([inv.id]);
    expect(occurrenceSync.reopened).toEqual([inv.id]);
  });

  it("paga à mão antes da conciliação: mantém o pagamento e nunca o desfaz", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);
    await new MarkInvoicePaidUseCase(invoiceRepo, payableWrite, occurrenceSync).execute({ organizationId: ORG_ID, id: inv.id, paidAt: "2026-09-05" });

    await settle.execute({ organizationId: ORG_ID, invoiceId: inv.id, paidAt: "2026-09-10", bankAccountId: null, paidByThisReconciliation: false });
    let saved = (await invoiceRepo.findById(ORG_ID, inv.id))!;
    expect(saved.paidAt!.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(saved.isPaidByBank).toBe(false);

    expect(await reopen.execute({ organizationId: ORG_ID, invoiceId: inv.id })).toBe(false);
    saved = (await invoiceRepo.findById(ORG_ID, inv.id))!;
    expect(saved.status).toBe("paid");
    expect(payableWrite.reopened).toEqual([]);
  });

  it("fatura não paga e não conciliada: reabrir não faz nada", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);
    expect(await reopen.execute({ organizationId: ORG_ID, invoiceId: inv.id })).toBe(false);
  });
});
