import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type {
  ListReconciliationRulesPort,
  ReconciliationRuleDto,
} from "../../domain/ports/in/bank-statement.ports.js";
import { ruleToDto } from "./create-reconciliation-rule.use-case.js";

export class ListReconciliationRulesUseCase implements ListReconciliationRulesPort {
  constructor(private readonly ruleRepo: BankReconciliationRuleRepositoryPort) {}

  async execute(activeOnly = false): Promise<ReconciliationRuleDto[]> {
    const rules = await this.ruleRepo.findAll(activeOnly);
    return rules.map(ruleToDto);
  }
}
