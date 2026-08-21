import { describe, it, expect, beforeEach } from "@jest/globals";
import { ApplyAutoRulesUseCase } from "../../application/use-cases/apply-auto-rules.use-case.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeBankReconciliationRuleRepository } from "../fakes/fake-bank-reconciliation-rule-repository.js";
import { StatementNotFoundError } from "../../domain/errors.js";

function makeStatement() {
  return BankStatementImport.create({
    bankName: "BCP",
    accountNumber: "PT123",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-07-07T00:00:00.000Z"),
    sourceType: "csv",
    openingBalance: 150_000,
    closingBalance: 145_000,
  });
}

function makeDebit(desc: string, hash: string, stmtId: string) {
  return BankMovement.create({
    statementImportId: stmtId,
    bookingDate: new Date("2026-07-01T00:00:00.000Z"),
    valueDate: new Date("2026-07-01T00:00:00.000Z"),
    description: desc,
    amount: 500,
    balanceAfter: 149_500,
    movementType: "debit",
    deduplicationHash: hash,
  });
}

function makeRule() {
  return BankReconciliationRule.create({
    name: "Comissão de conta",
    descriptionContains: "COM.MAN.CONTA",
    movementType: "debit",
    justificationType: "despesa_bancaria_automatica",
    requiresDocument: false,
    riskLevel: "low",
  });
}

describe("ApplyAutoRulesUseCase", () => {
  let statementRepo: FakeBankStatementImportRepository;
  let movementRepo: FakeBankMovementRepository;
  let ruleRepo: FakeBankReconciliationRuleRepository;
  let useCase: ApplyAutoRulesUseCase;

  beforeEach(() => {
    statementRepo = new FakeBankStatementImportRepository();
    movementRepo = new FakeBankMovementRepository();
    ruleRepo = new FakeBankReconciliationRuleRepository();
    useCase = new ApplyAutoRulesUseCase(statementRepo, movementRepo, ruleRepo);
  });

  it("throws StatementNotFoundError for unknown statement", async () => {
    await expect(useCase.execute("not-found")).rejects.toThrow(StatementNotFoundError);
  });

  it("applies matching rule to unresolved movements", async () => {
    const stmt = makeStatement();
    await statementRepo.save(stmt);
    const m1 = makeDebit("COM.MAN.CONTA OUTUBRO", "h1", stmt.id);
    const m2 = makeDebit("PAGAMENTO MAKRO", "h2", stmt.id);
    await movementRepo.saveBulk([m1, m2]);
    await ruleRepo.save(makeRule());

    const result = await useCase.execute(stmt.id);

    expect(result.appliedCount).toBe(1);
    const updated = await movementRepo.findById(m1.id);
    expect(updated?.reconciliationStatus).toBe("justificado");
    // m2 not matched
    const m2Updated = await movementRepo.findById(m2.id);
    expect(m2Updated?.reconciliationStatus).toBe("saida_nao_justificada");
  });

  it("does not apply rules to already resolved movements", async () => {
    const stmt = makeStatement();
    await statementRepo.save(stmt);
    const m = makeDebit("COM.MAN.CONTA", "h1", stmt.id).classify({
      justificationType: "fatura",
    });
    await movementRepo.saveBulk([m]);
    await ruleRepo.save(makeRule());

    const result = await useCase.execute(stmt.id);
    expect(result.appliedCount).toBe(0);
  });
});
