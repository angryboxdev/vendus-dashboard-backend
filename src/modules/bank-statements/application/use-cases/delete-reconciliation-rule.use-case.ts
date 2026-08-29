import { RuleNotFoundError } from "../../domain/errors.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type { DeleteReconciliationRuleCommand, DeleteReconciliationRulePort } from "../../domain/ports/in/bank-statement.ports.js";

export class DeleteReconciliationRuleUseCase implements DeleteReconciliationRulePort {
  constructor(private readonly ruleRepo: BankReconciliationRuleRepositoryPort) {}

  async execute(command: DeleteReconciliationRuleCommand): Promise<void> {
    const { organizationId, id } = command;
    const rule = await this.ruleRepo.findById(organizationId, id);
    if (!rule) throw new RuleNotFoundError(id);
    await this.ruleRepo.delete(organizationId, id);
  }
}
