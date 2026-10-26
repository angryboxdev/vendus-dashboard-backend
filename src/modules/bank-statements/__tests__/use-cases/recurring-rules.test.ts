import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { CreateReconciliationRuleUseCase } from "../../application/use-cases/create-reconciliation-rule.use-case.js";
import { UpdateReconciliationRuleUseCase } from "../../application/use-cases/update-reconciliation-rule.use-case.js";
import { ListReconciliationRulesUseCase } from "../../application/use-cases/list-reconciliation-rules.use-case.js";
import { DeleteReconciliationRuleUseCase } from "../../application/use-cases/delete-reconciliation-rule.use-case.js";
import { ImportBankStatementUseCase } from "../../application/use-cases/import-bank-statement.use-case.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeBankReconciliationRuleRepository } from "../fakes/fake-bank-reconciliation-rule-repository.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { InvalidRuleError, RuleNotFoundError } from "../../domain/errors.js";

// Dados fictícios.
const organizationId = mintOrganizationId("org-a");
const ACCOUNT = "acc-1";

function statement() {
  return BankStatementImport.create({
    bankAccountId: ACCOUNT,
    bankName: "Millennium BCP",
    accountNumber: "000000000001",
    periodStart: new Date("2026-08-01T00:00:00.000Z"),
    periodEnd: new Date("2026-08-31T00:00:00.000Z"),
    sourceType: "pdf",
    openingBalance: 0,
    closingBalance: 0,
  });
}

function debit(statementImportId: string, description: string, day: string, amount = 1_230, bankAccountId = ACCOUNT) {
  return BankMovement.create({
    bankAccountId,
    statementImportId,
    bookingDate: new Date(`${day}T00:00:00.000Z`),
    valueDate: new Date(`${day}T00:00:00.000Z`),
    description,
    amount,
    balanceAfter: 0,
    movementType: "debit",
    deduplicationHash: `${statementImportId}|${description}|${day}|${amount}|${bankAccountId}`,
  });
}

const fee = {
  organizationId,
  name: "Tarifa mensal",
  descriptionContains: "TARIFA MENSAL / COMPLEMENTAR 002995409",
  movementType: "debit" as const,
  bankAccountId: ACCOUNT,
  justificationType: "despesa_bancaria_automatica" as const,
  costCenterGroupId: "cc-group",
};

describe("«Movimentos recorrentes» — casos de uso", () => {
  let ruleRepo: FakeBankReconciliationRuleRepository;
  let movementRepo: FakeBankMovementRepository;
  let statementRepo: FakeBankStatementImportRepository;
  let create: CreateReconciliationRuleUseCase;
  let update: UpdateReconciliationRuleUseCase;

  beforeEach(() => {
    ruleRepo = new FakeBankReconciliationRuleRepository();
    movementRepo = new FakeBankMovementRepository();
    statementRepo = new FakeBankStatementImportRepository();
    create = new CreateReconciliationRuleUseCase(ruleRepo, { movementRepo, statementRepo });
    update = new UpdateReconciliationRuleUseCase(ruleRepo, { movementRepo, statementRepo });
  });

  it("creating with applyToExisting reconciles untouched movements of the account in every month", async () => {
    const aug = statement();
    const sep = statement();
    await statementRepo.save(organizationId, aug);
    await statementRepo.save(organizationId, sep);
    const m1 = debit(aug.id, "TARIFA MENSAL / COMPLEMENTAR 002995409", "2026-08-01");
    const m2 = debit(sep.id, "TARIFA MENSAL / COMPLEMENTAR 003114771", "2026-09-01");
    const otherAccount = debit(sep.id, "TARIFA MENSAL / COMPLEMENTAR 1", "2026-09-01", 1_230, "acc-2");
    const manual = debit(sep.id, "TARIFA MENSAL / COMPLEMENTAR 2", "2026-09-15").classify({ justificationType: "recibo_comprovativo" });
    await movementRepo.saveBulk(organizationId, [m1, m2, otherAccount, manual]);

    const result = await create.execute({ ...fee, applyToExisting: true });

    expect(result.appliedCount).toBe(2);
    expect((await movementRepo.findById(organizationId, m1.id))?.classifiedByRuleId).toBe(result.id);
    expect((await movementRepo.findById(organizationId, m2.id))?.costCenterGroupId).toBe("cc-group");
    expect((await movementRepo.findById(organizationId, otherAccount.id))?.isUntouched).toBe(true);
    expect((await movementRepo.findById(organizationId, manual.id))?.classifiedByRuleId).toBeNull();
  });

  it("does not touch movements of a closed statement", async () => {
    const closed = statement().close();
    await statementRepo.save(organizationId, closed);
    const m = debit(closed.id, "TARIFA MENSAL / COMPLEMENTAR 1", "2026-08-01");
    await movementRepo.saveBulk(organizationId, [m]);

    const result = await create.execute({ ...fee, applyToExisting: true });

    expect(result.appliedCount).toBe(0);
    expect((await movementRepo.findById(organizationId, m.id))?.isUntouched).toBe(true);
  });

  it("without applyToExisting only saves the rule", async () => {
    const s = statement();
    await statementRepo.save(organizationId, s);
    await movementRepo.saveBulk(organizationId, [debit(s.id, "TARIFA MENSAL / COMPLEMENTAR 1", "2026-08-01")]);
    expect((await create.execute(fee)).appliedCount).toBe(0);
  });

  it("rejects a rule that would need an invoice", async () => {
    await expect(create.execute({ ...fee, justificationType: "fatura" })).rejects.toThrow(InvalidRuleError);
  });

  it("update: pause, edit the fixed amount and reactivate applying to existing", async () => {
    const s = statement();
    await statementRepo.save(organizationId, s);
    const m = debit(s.id, "TARIFA MENSAL / COMPLEMENTAR 1", "2026-08-01", 1_500);
    await movementRepo.saveBulk(organizationId, [m]);
    const created = await create.execute({ ...fee, amountCents: 1_230 });

    const paused = await update.execute({ organizationId, id: created.id, isActive: false });
    expect(paused.isActive).toBe(false);

    const reactivated = await update.execute({ organizationId, id: created.id, isActive: true, amountCents: null, applyToExisting: true });
    expect(reactivated.isActive).toBe(true);
    expect(reactivated.amountCents).toBeNull();
    expect(reactivated.appliedCount).toBe(1);
  });

  it("update: unknown rule → RuleNotFoundError", async () => {
    await expect(update.execute({ organizationId, id: "nope", name: "x" })).rejects.toThrow(RuleNotFoundError);
  });

  it("list shows how many movements each rule reconciled and the last date", async () => {
    const s = statement();
    await statementRepo.save(organizationId, s);
    await movementRepo.saveBulk(organizationId, [
      debit(s.id, "TARIFA MENSAL / COMPLEMENTAR 1", "2026-08-01"),
      debit(s.id, "TARIFA MENSAL / COMPLEMENTAR 2", "2026-09-01"),
    ]);
    const created = await create.execute({ ...fee, applyToExisting: true });
    await create.execute({ ...fee, name: "Sem uso", descriptionContains: "OUTRA COISA" });

    const list = await new ListReconciliationRulesUseCase(ruleRepo, movementRepo).execute({ organizationId });

    expect(list.find((r) => r.id === created.id)?.usage).toEqual({ movementsCount: 2, lastBookingDate: "2026-09-01" });
    expect(list.find((r) => r.name === "Sem uso")?.usage).toEqual({ movementsCount: 0, lastBookingDate: null });
  });

  it("delete keeps the movements' classification and only drops the link", async () => {
    const s = statement();
    await statementRepo.save(organizationId, s);
    const m = debit(s.id, "TARIFA MENSAL / COMPLEMENTAR 1", "2026-08-01");
    await movementRepo.saveBulk(organizationId, [m]);
    const created = await create.execute({ ...fee, applyToExisting: true });

    await new DeleteReconciliationRuleUseCase(ruleRepo, movementRepo).execute({ organizationId, id: created.id });

    const after = await movementRepo.findById(organizationId, m.id);
    expect(after?.classifiedByRuleId).toBeNull();
    expect(after?.reconciliationStatus).toBe("justificado");
    expect(await ruleRepo.findAll(organizationId)).toHaveLength(0);
  });

  it("import reconciles new movements that match a rule, before saving", async () => {
    await create.execute(fee);
    const importer = new ImportBankStatementUseCase(statementRepo, movementRepo, undefined, undefined, ruleRepo);

    const result = await importer.execute({
      organizationId,
      bankAccountId: ACCOUNT,
      bankName: "Millennium BCP",
      accountNumber: "000000000001",
      periodStart: new Date("2026-10-01T00:00:00.000Z"),
      periodEnd: new Date("2026-10-31T00:00:00.000Z"),
      sourceType: "pdf",
      openingBalance: 10_000,
      closingBalance: 8_770,
      movements: [
        { bookingDate: new Date("2026-10-01T00:00:00.000Z"), valueDate: new Date("2026-10-01T00:00:00.000Z"), description: "TARIFA MENSAL / COMPLEMENTAR 003390001", amount: 1_230, balanceAfter: 8_770, movementType: "debit" },
        { bookingDate: new Date("2026-10-02T00:00:00.000Z"), valueDate: new Date("2026-10-02T00:00:00.000Z"), description: "TRF P/ Fornecedor Exemplo", amount: 5_000, balanceAfter: 3_770, movementType: "debit" },
      ],
    });

    expect(result.autoClassifiedCount).toBe(1);
    const saved = await movementRepo.findByStatementId(organizationId, result.id);
    const feeMovement = saved.find((m) => m.description.startsWith("TARIFA"));
    expect(feeMovement?.classifiedByRuleId).not.toBeNull();
    expect(feeMovement?.reconciliationStatus).toBe("justificado");
    expect(saved.find((m) => m.description.startsWith("TRF"))?.isUntouched).toBe(true);
  });

  it("import without a known account does not apply rules", async () => {
    await create.execute(fee);
    const importer = new ImportBankStatementUseCase(statementRepo, movementRepo, undefined, undefined, ruleRepo);
    const result = await importer.execute({
      organizationId,
      bankName: "Millennium BCP",
      accountNumber: "000000000001",
      periodStart: new Date("2026-10-01T00:00:00.000Z"),
      periodEnd: new Date("2026-10-31T00:00:00.000Z"),
      sourceType: "pdf",
      openingBalance: 10_000,
      closingBalance: 8_770,
      movements: [
        { bookingDate: new Date("2026-10-01T00:00:00.000Z"), valueDate: new Date("2026-10-01T00:00:00.000Z"), description: "TARIFA MENSAL / COMPLEMENTAR 1", amount: 1_230, balanceAfter: 8_770, movementType: "debit" },
      ],
    });
    expect(result.autoClassifiedCount).toBe(0);
  });
});
