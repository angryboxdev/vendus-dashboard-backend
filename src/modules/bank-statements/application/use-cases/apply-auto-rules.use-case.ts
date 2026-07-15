import { AutoMatchingService } from "../../domain/services/auto-matching.service.js";
import { ReconciliationCalculatorService } from "../../domain/services/reconciliation-calculator.service.js";
import { StatementNotFoundError } from "../../domain/errors.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type {
  ApplyAutoRulesPort,
  ApplyAutoRulesResult,
} from "../../domain/ports/in/bank-statement.ports.js";

export class ApplyAutoRulesUseCase implements ApplyAutoRulesPort {
  private readonly matcher = new AutoMatchingService();
  private readonly calculator = new ReconciliationCalculatorService();

  constructor(
    private readonly statementRepo: BankStatementImportRepositoryPort,
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly ruleRepo: BankReconciliationRuleRepositoryPort
  ) {}

  async execute(statementImportId: string): Promise<ApplyAutoRulesResult> {
    const statement = await this.statementRepo.findById(statementImportId);
    if (!statement) throw new StatementNotFoundError(statementImportId);

    const [rules, movements] = await Promise.all([
      this.ruleRepo.findAll(true),
      this.movementRepo.findByStatementId(statementImportId),
    ]);

    const matches = this.matcher.applyRules(rules, movements);

    // Persist each matched movement
    for (const { updated } of matches) {
      await this.movementRepo.update(updated);
    }

    // Recompute progress using all movements (with applied updates in-memory)
    const updatedMap = new Map(matches.map(({ updated }) => [updated.id, updated]));
    const allUpdated = movements.map((m) => updatedMap.get(m.id) ?? m);
    const stats = this.calculator.compute(statement.openingBalance, allUpdated);

    const updatedStatement = statement.updateStats({
      importedMovementsCount: statement.importedMovementsCount,
      calculatedClosingBalance: stats.calculatedClosingBalance,
      reconciliationProgress: stats.reconciliationProgress,
    });
    await this.statementRepo.update(updatedStatement);

    return {
      statementImportId,
      appliedCount: matches.length,
      reconciliationProgress: stats.reconciliationProgress,
    };
  }
}
