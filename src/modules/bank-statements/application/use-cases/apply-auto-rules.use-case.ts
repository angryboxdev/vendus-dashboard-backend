import { AutoMatchingService } from "../../domain/services/auto-matching.service.js";
import { ReconciliationCalculatorService } from "../../domain/services/reconciliation-calculator.service.js";
import { StatementNotFoundError } from "../../domain/errors.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type {
  ApplyAutoRulesCommand,
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

  async execute(command: ApplyAutoRulesCommand): Promise<ApplyAutoRulesResult> {
    const { organizationId, statementImportId } = command;
    const statement = await this.statementRepo.findById(organizationId, statementImportId);
    if (!statement) throw new StatementNotFoundError(statementImportId);

    const [rules, movements] = await Promise.all([
      this.ruleRepo.findAll(organizationId, true),
      this.movementRepo.findByStatementId(organizationId, statementImportId),
    ]);

    const matches = this.matcher.applyRules(rules, movements);

    // Persist each matched movement
    for (const { updated } of matches) {
      await this.movementRepo.update(organizationId, updated);
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
    await this.statementRepo.update(organizationId, updatedStatement);

    return {
      statementImportId,
      appliedCount: matches.length,
      reconciliationProgress: stats.reconciliationProgress,
    };
  }
}
