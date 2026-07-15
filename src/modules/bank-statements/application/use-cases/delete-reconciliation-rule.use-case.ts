import { RuleNotFoundError } from "../../domain/errors.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type { DeleteReconciliationRulePort } from "../../domain/ports/in/bank-statement.ports.js";

export class DeleteReconciliationRuleUseCase implements DeleteReconciliationRulePort {
  constructor(private readonly ruleRepo: BankReconciliationRuleRepositoryPort) {}

  async execute(id: string): Promise<void> {
    const rule = await this.ruleRepo.findById(id);
    if (!rule) throw new RuleNotFoundError(id);
    await this.ruleRepo.delete(id);
  }
}
