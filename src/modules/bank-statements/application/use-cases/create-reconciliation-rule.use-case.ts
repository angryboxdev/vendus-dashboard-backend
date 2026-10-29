import { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type {
  CreateReconciliationRuleCommand,
  CreateReconciliationRulePort,
  ReconciliationRuleDto,
  ReconciliationRuleWriteResult,
} from "../../domain/ports/in/bank-statement.ports.js";
import { applyRulesToAccount } from "./apply-rules-to-account.js";
import type { RecurrenceLinkingDeps } from "./rule-recurrence-linking.js";
import { assertRecurrenceRule } from "./rule-recurrence-validation.js";
import type { OccurrenceMatchReadPort } from "../../domain/ports/out/occurrence-match-read.port.js";

function toDto(r: BankReconciliationRule): ReconciliationRuleDto {
  return {
    id: r.id,
    name: r.name,
    descriptionContains: r.descriptionContains,
    movementType: r.movementType,
    bankAccountId: r.bankAccountId,
    amountCents: r.amountCents,
    amountToleranceCents: r.amountToleranceCents,
    costCenterGroupId: r.costCenterGroupId,
    costCenterCategoryId: r.costCenterCategoryId,
    supplierId: r.supplierId,
    vatRate: r.vatRate,
    vatIncluded: r.vatIncluded,
    recurrenceId: r.recurrenceId,
    classifyOnly: r.classifyOnly,
    justificationType: r.justificationType,
    requiresDocument: r.requiresDocument,
    affectsDre: r.affectsDre,
    affectsCashflow: r.affectsCashflow,
    affectsProfitability: r.affectsProfitability,
    riskLevel: r.riskLevel,
    isActive: r.isActive,
    createdAt: r.createdAt,
  };
}

/** Repositórios para aplicar a regra aos meses já importados (`applyToExisting`). */
export interface RuleBackfillDeps {
  movementRepo: BankMovementRepositoryPort;
  statementRepo: BankStatementImportRepositoryPort;
  /** Regras ligadas a recorrências (rendas, salários): ligar à ocorrência e validar a regra. */
  recurrenceLinking?: RecurrenceLinkingDeps;
  occurrenceRead?: OccurrenceMatchReadPort;
}

export class CreateReconciliationRuleUseCase implements CreateReconciliationRulePort {
  constructor(
    private readonly ruleRepo: BankReconciliationRuleRepositoryPort,
    private readonly backfill?: RuleBackfillDeps,
  ) {}

  async execute(command: CreateReconciliationRuleCommand): Promise<ReconciliationRuleWriteResult> {
    const { organizationId, applyToExisting, ...props } = command;
    const rule = BankReconciliationRule.create(props);
    await assertRecurrenceRule(organizationId, rule, {
      ruleRepo: this.ruleRepo,
      movementRepo: this.backfill?.movementRepo,
      target: this.backfill?.recurrenceLinking?.target,
      occurrenceRead: this.backfill?.occurrenceRead,
    });
    await this.ruleRepo.save(organizationId, rule);

    const appliedCount =
      applyToExisting && rule.bankAccountId && this.backfill
        ? await applyRulesToAccount(this.backfill, organizationId, rule.bankAccountId, [rule])
        : 0;
    return { ...toDto(rule), appliedCount };
  }
}

export { toDto as ruleToDto };
