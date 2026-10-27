import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { ClassifyMovementUseCase } from "../../application/use-cases/classify-movement.use-case.js";
import { UnreconcileMovementUseCase } from "../../application/use-cases/unreconcile-movement.use-case.js";
import { GetMonthlySuggestionsUseCase } from "../../application/use-cases/get-monthly-suggestions.use-case.js";
import { FindMovementCandidatesUseCase } from "../../application/use-cases/find-movement-candidates.use-case.js";
import type { OccurrencePaymentPort } from "../../domain/ports/out/occurrence-payment.port.js";
import type { OccurrenceMatchCandidate } from "../../domain/ports/out/occurrence-match-read.port.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import { FakeInvoiceReconciliationWrite } from "../fakes/fake-invoice-reconciliation-write.js";
import { FakePayableEntryMatchRead } from "../fakes/fake-payable-entry-match-read.js";
import { FakeMovementMatchHint } from "../fakes/fake-movement-match-hint.js";
import { FakeOccurrenceMatchReadAdapter } from "../fakes/fake-occurrence-match-read.js";
import { OccurrenceRequiresInvoiceError } from "../../domain/errors.js";
import { DeleteBankStatementUseCase } from "../../application/use-cases/delete-bank-statement.use-case.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";

// Dados fictícios.
const organizationId = mintOrganizationId("org-a");
const ACCOUNT = "acc-1";

class RecordingOccurrencePayment implements OccurrencePaymentPort {
  readonly settled: { occurrenceId: string; movementId: string; paidAt: string }[] = [];
  readonly reopened: { occurrenceId: string; movementId: string }[] = [];
  /** Ocorrências com fatura (o adapter real lança o erro). */
  readonly withInvoice = new Set<string>();
  async settle(_org: unknown, input: { occurrenceId: string; movementId: string; paidAt: string }) {
    if (this.withInvoice.has(input.occurrenceId)) throw new OccurrenceRequiresInvoiceError(input.occurrenceId);
    this.settled.push({ occurrenceId: input.occurrenceId, movementId: input.movementId, paidAt: input.paidAt });
  }
  async reopen(_org: unknown, input: { occurrenceId: string; movementId: string }) {
    this.reopened.push(input);
  }
}

const salary = (amount = 135_000, date = "2026-09-01", statementImportId = "stmt-1") =>
  BankMovement.create({
    bankAccountId: ACCOUNT,
    statementImportId,
    bookingDate: new Date(`${date}T00:00:00.000Z`),
    valueDate: new Date(`${date}T00:00:00.000Z`),
    description: "TRF P/ COLABORADOR EXEMPLO SANTOS",
    amount,
    balanceAfter: 0,
    movementType: "debit",
    deduplicationHash: `h-${amount}-${date}`,
  });

const occurrence = (over: Partial<OccurrenceMatchCandidate> = {}): OccurrenceMatchCandidate => ({
  id: "occ-9",
  recurrenceId: "rec-1",
  recurrenceName: "Salário — Colaborador Exemplo Santos",
  supplierId: null,
  supplierName: "Colaborador Exemplo Santos",
  period: "2026-09",
  estimatedAmountCents: 135_000,
  realAmountCents: null,
  effectiveAmountCents: 135_000,
  dueDate: "2026-09-01",
  status: "forecast",
  costCenterGroupId: "grp-pessoal",
  costCenterCategoryId: "cat-salarios",
  vatRate: null,
  vatIncluded: null,
  ...over,
});

describe("Conciliação ↔ recorrências: a ocorrência fica paga", () => {
  let movementRepo: FakeBankMovementRepository;
  let payment: RecordingOccurrencePayment;

  beforeEach(() => {
    movementRepo = new FakeBankMovementRepository();
    payment = new RecordingOccurrencePayment();
  });

  it("classificar como Contrato/Recorrência com a ocorrência → paga com a data do movimento", async () => {
    const m = salary(140_000);
    await movementRepo.saveBulk(organizationId, [m]);
    await new ClassifyMovementUseCase(movementRepo, payment).execute({
      organizationId, movementId: m.id, justificationType: "contrato_recorrencia", matchedEntityType: "recurrence_occurrence", matchedEntityId: "occ-9",
    });
    expect(payment.settled).toEqual([{ occurrenceId: "occ-9", movementId: m.id, paidAt: "2026-09-01" }]);
  });

  it("mudar o movimento para outra ocorrência reabre a anterior; classificar sem recorrência também", async () => {
    const m = salary();
    await movementRepo.saveBulk(organizationId, [m]);
    const classify = new ClassifyMovementUseCase(movementRepo, payment);
    await classify.execute({ organizationId, movementId: m.id, justificationType: "contrato_recorrencia", matchedEntityType: "recurrence_occurrence", matchedEntityId: "occ-9" });
    await classify.execute({ organizationId, movementId: m.id, justificationType: "contrato_recorrencia", matchedEntityType: "recurrence_occurrence", matchedEntityId: "occ-10" });
    expect(payment.reopened).toEqual([{ occurrenceId: "occ-9", movementId: m.id }]);
    await classify.execute({ organizationId, movementId: m.id, justificationType: "recibo_comprovativo" });
    expect(payment.reopened).toEqual([{ occurrenceId: "occ-9", movementId: m.id }, { occurrenceId: "occ-10", movementId: m.id }]);
  });

  it("ocorrência com fatura → recusa e não grava o movimento (concilia-se pela fatura)", async () => {
    const m = salary();
    await movementRepo.saveBulk(organizationId, [m]);
    payment.withInvoice.add("occ-9");
    await expect(
      new ClassifyMovementUseCase(movementRepo, payment).execute({
        organizationId, movementId: m.id, justificationType: "contrato_recorrencia", matchedEntityType: "recurrence_occurrence", matchedEntityId: "occ-9",
      }),
    ).rejects.toThrow(OccurrenceRequiresInvoiceError);
    const saved = (await movementRepo.findById(organizationId, m.id))!;
    expect(saved.matchedEntityId).toBeNull();
    expect(saved.justificationType).toBeNull();
  });

  it("eliminar o extrato reabre as ocorrências que os movimentos dele pagaram", async () => {
    const statementRepo = new FakeBankStatementImportRepository();
    const statement = BankStatementImport.create({
      bankName: "Banco Exemplo", accountNumber: "0000-1111", periodStart: new Date("2026-09-01"), periodEnd: new Date("2026-09-30"),
      sourceType: "pdf", openingBalance: 0, closingBalance: 0,
    });
    await statementRepo.save(organizationId, statement);
    const m = salary(135_000, "2026-09-01", statement.id).classify({ justificationType: "contrato_recorrencia", matchedEntityType: "recurrence_occurrence", matchedEntityId: "occ-9" });
    await movementRepo.saveBulk(organizationId, [m, salary(5_000, "2026-09-02", statement.id)]);
    await new DeleteBankStatementUseCase(statementRepo, {
      movementRepo, linkRepo: new FakeBankMovementEntityLinkRepository(), invoiceRead: new FakeInvoiceMatchRead(), invoiceReconciliationWrite: new FakeInvoiceReconciliationWrite(), occurrencePayment: payment,
    }).execute({ organizationId, statementImportId: statement.id });
    expect(payment.reopened).toEqual([{ occurrenceId: "occ-9", movementId: m.id }]);
  });

  it("anular a conciliação reabre a ocorrência", async () => {
    const m = salary().classify({ justificationType: "contrato_recorrencia", matchedEntityType: "recurrence_occurrence", matchedEntityId: "occ-9" });
    await movementRepo.saveBulk(organizationId, [m]);
    await new UnreconcileMovementUseCase(movementRepo, new FakeBankMovementEntityLinkRepository(), new FakeInvoiceMatchRead(), new FakeInvoiceReconciliationWrite(), payment).execute({ organizationId, movementId: m.id });
    expect(payment.reopened).toEqual([{ occurrenceId: "occ-9", movementId: m.id }]);
  });
});

describe("Sugestões: recorrências sem fatura (salários, rendas…)", () => {
  const build = (occurrences: OccurrenceMatchCandidate[]) => {
    const movementRepo = new FakeBankMovementRepository();
    const occurrenceRead = new FakeOccurrenceMatchReadAdapter();
    occurrenceRead.seed(organizationId, occurrences);
    const find = new FindMovementCandidatesUseCase(movementRepo, new FakeInvoiceMatchRead(), new FakePayableEntryMatchRead(), new FakeMovementMatchHint(), new FakeBankMovementEntityLinkRepository());
    return { movementRepo, useCase: new GetMonthlySuggestionsUseCase(movementRepo, find, occurrenceRead) };
  };

  it("sugere a ocorrência do salário quando o nome do colaborador e o valor batem", async () => {
    const { movementRepo, useCase } = build([occurrence()]);
    const m = salary();
    await movementRepo.saveBulk(organizationId, [m]);
    const s = await useCase.execute({ organizationId, bankAccountId: ACCOUNT, year: 2026, month: 9 });
    expect(s.occurrenceMatches).toHaveLength(1);
    expect(s.occurrenceMatches[0]).toMatchObject({ movementId: m.id, occurrenceId: "occ-9", costCenterCategoryId: "cat-salarios" });
    expect(s.occurrenceMatches[0]!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("não sugere com outro nome, outro valor, já paga, nem com fatura (essas vão pela fatura)", async () => {
    for (const occ of [
      occurrence({ supplierName: "Outra Pessoa", recurrenceName: "Salário — Outra Pessoa" }),
      occurrence({ effectiveAmountCents: 99_000 }),
      occurrence({ status: "paid" }),
      occurrence({ status: "invoice_linked" }),
      occurrence({ status: "awaiting_invoice" }),
    ]) {
      const { movementRepo, useCase } = build([occ]);
      await movementRepo.saveBulk(organizationId, [salary()]);
      const s = await useCase.execute({ organizationId, bankAccountId: ACCOUNT, year: 2026, month: 9 });
      expect(s.occurrenceMatches).toHaveLength(0);
    }
  });
});
