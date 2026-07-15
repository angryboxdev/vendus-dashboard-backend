import { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type {
  CreateReconciliationRuleCommand,
  CreateReconciliationRulePort,
  ReconciliationRuleDto,
} from "../../domain/ports/in/bank-statement.ports.js";

function toDto(r: BankReconciliationRule): ReconciliationRuleDto {
  return {
    id: r.id,
    name: r.name,
    descriptionContains: r.descriptionContains,
    movementType: r.movementType,
    costCenterGroupId: r.costCenterGroupId,
    costCenterCategoryId: r.costCenterCategoryId,
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

export class CreateReconciliationRuleUseCase implements CreateReconciliationRulePort {
  constructor(private readonly ruleRepo: BankReconciliationRuleRepositoryPort) {}

  async execute(command: CreateReconciliationRuleCommand): Promise<ReconciliationRuleDto> {
    const rule = BankReconciliationRule.create(command);
    await this.ruleRepo.save(rule);
    return toDto(rule);
  }
}

export { toDto as ruleToDto };
