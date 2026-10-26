import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { DeleteBankStatementUseCase } from "../../application/use-cases/delete-bank-statement.use-case.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { StatementNotFoundError } from "../../domain/errors.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeBankMovementEntityLinkRepository } from "../fakes/fake-bank-movement-entity-link-repository.js";
import { FakeInvoiceMatchRead } from "../fakes/fake-invoice-match-read.js";
import { FakeInvoiceReconciliationWrite } from "../fakes/fake-invoice-reconciliation-write.js";
import type { InvoiceMatchCandidate } from "../../domain/ports/out/invoice-match-read.port.js";

function makeStatement(accountNumber = "1234-5678") {
  return BankStatementImport.create({
    bankName: "Millennium BCP",
    accountNumber,
    periodStart: new Date("2026-07-01"),
    periodEnd: new Date("2026-07-31"),
    sourceType: "csv",
    openingBalance: 100_000,
    closingBalance: 95_000,
  });
}

describe("DeleteBankStatementUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let repo: FakeBankStatementImportRepository;
  let useCase: DeleteBankStatementUseCase;

  beforeEach(() => {
    repo = new FakeBankStatementImportRepository();
    useCase = new DeleteBankStatementUseCase(repo);
  });

  it("throws StatementNotFoundError for unknown id", async () => {
    await expect(
      useCase.execute({ organizationId, statementImportId: "not-found" })
    ).rejects.toThrow(StatementNotFoundError);
  });

  it("removes the statement from the repository", async () => {
    const statement = makeStatement();
    await repo.save(organizationId, statement);

    await useCase.execute({ organizationId, statementImportId: statement.id });

    const found = await repo.findById(organizationId, statement.id);
    expect(found).toBeNull();
  });

  it("does not remove other statements", async () => {
    const s1 = makeStatement("111");
    const s2 = makeStatement("222");
    await repo.save(organizationId, s1);
    await repo.save(organizationId, s2);

    await useCase.execute({ organizationId, statementImportId: s1.id });

    const remaining = await repo.findAll(organizationId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(s2.id);
  });
});

describe("DeleteBankStatementUseCase — faturas voltam ao estado certo", () => {
  const organizationId = mintOrganizationId("org-a");
  // Dados fictícios.
  const invoice = (id: string, totalWithVat: number): InvoiceMatchCandidate => ({
    id, supplierId: "sup-1", supplierName: "Fornecedor Exemplo", invoiceNumber: `FT ${id}`, totalWithVat,
    invoiceDate: "2026-09-01", dueDate: null, paidAt: null, status: "paid", currency: "EUR", documentType: "invoice",
  });
  const movement = (statementImportId: string, id: string) =>
    BankMovement.reconstitute({
      ...BankMovement.create({
        statementImportId, bookingDate: new Date("2026-09-05T00:00:00.000Z"), valueDate: new Date("2026-09-05T00:00:00.000Z"),
        description: "TRF P/ Fornecedor Exemplo", amount: 10_000, balanceAfter: 0, movementType: "debit", deduplicationHash: id,
      }) as unknown as Parameters<typeof BankMovement.reconstitute>[0],
      id,
    });
  const link = (movementId: string, entityId: string, allocatedAmountCents: number) => ({
    id: `l-${movementId}-${entityId}`, movementId, entityType: "invoice" as const, entityId, amountCents: 10_000, allocatedAmountCents, entityLabel: "Fornecedor Exemplo",
  });

  it("elimina o extrato e repõe as faturas: sem vínculos → por conciliar; com outro movimento abaixo do total → parcial; ainda paga → não mexe", async () => {
    const statements = new FakeBankStatementImportRepository();
    const movementRepo = new FakeBankMovementRepository();
    const linkRepo = new FakeBankMovementEntityLinkRepository();
    const invoiceRead = new FakeInvoiceMatchRead();
    const write = new FakeInvoiceReconciliationWrite();
    const sep = makeStatement();
    const other = makeStatement();
    await statements.save(organizationId, sep);
    await statements.save(organizationId, other);
    await movementRepo.saveBulk(organizationId, [movement(sep.id, "m1"), movement(sep.id, "m2"), movement(other.id, "m3")]);
    await linkRepo.saveAll(organizationId, [
      link("m1", "inv-only-sep", 10_000),
      link("m2", "inv-shared", 6_000),
      link("m3", "inv-shared", 4_000),
      link("m2", "inv-paid-elsewhere", 1_000),
      link("m3", "inv-paid-elsewhere", 10_000),
    ]);
    invoiceRead.setcandidates(organizationId, [invoice("inv-only-sep", 10_000), invoice("inv-shared", 10_000), invoice("inv-paid-elsewhere", 10_000)]);

    await new DeleteBankStatementUseCase(statements, { movementRepo, linkRepo, invoiceRead, invoiceReconciliationWrite: write }).execute({ organizationId, statementImportId: sep.id });

    expect(await statements.findById(organizationId, sep.id)).toBeNull();
    expect(write.unreconciledCalls).toEqual(["inv-only-sep"]);
    expect(write.partialCalls).toEqual(["inv-shared"]);
    expect(write.reconciledCalls).toEqual([]);
    expect(await linkRepo.findByMovementIds(organizationId, ["m1", "m2"])).toEqual([]);
    expect((await linkRepo.findByMovementIds(organizationId, ["m3"])).length).toBe(2);
  });
});
