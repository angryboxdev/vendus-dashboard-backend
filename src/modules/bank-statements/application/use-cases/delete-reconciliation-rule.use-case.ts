import { RuleNotFoundError } from "../../domain/errors.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { DeleteReconciliationRuleCommand, DeleteReconciliationRulePort } from "../../domain/ports/in/bank-statement.ports.js";

export class DeleteReconciliationRuleUseCase implements DeleteReconciliationRulePort {
  constructor(
    private readonly ruleRepo: BankReconciliationRuleRepositoryPort,
    /** Os movimentos conciliados pela regra mantêm a classificação; só perdem a ligação (a FK não deixaria apagar). */
    private readonly movementRepo?: BankMovementRepositoryPort,
  ) {}

  async execute(command: DeleteReconciliationRuleCommand): Promise<void> {
    const { organizationId, id } = command;
    const rule = await this.ruleRepo.findById(organizationId, id);
    if (!rule) throw new RuleNotFoundError(id);
    if (this.movementRepo) await this.movementRepo.detachRule(organizationId, id);
    await this.ruleRepo.delete(organizationId, id);
  }
}
