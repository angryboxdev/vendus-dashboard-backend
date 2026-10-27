import { RuleNotFoundError } from "../../domain/errors.js";
import type { BankReconciliationRuleRepositoryPort } from "../../domain/ports/out/bank-reconciliation-rule-repository.port.js";
import type {
  ReconciliationRuleWriteResult,
  UpdateReconciliationRuleCommand,
  UpdateReconciliationRulePort,
} from "../../domain/ports/in/bank-statement.ports.js";
import { applyRulesToAccount } from "./apply-rules-to-account.js";
import { ruleToDto, type RuleBackfillDeps } from "./create-reconciliation-rule.use-case.js";
import { assertRecurrenceRule } from "./rule-recurrence-validation.js";

/**
 * Altera, pausa ou reativa um «movimento recorrente». Os movimentos já conciliados pela regra ficam como
 * estão (anula-se movimento a movimento); com `applyToExisting`, a regra (ativa) aplica-se aos intocados.
 */
export class UpdateReconciliationRuleUseCase implements UpdateReconciliationRulePort {
  constructor(
    private readonly ruleRepo: BankReconciliationRuleRepositoryPort,
    private readonly backfill: RuleBackfillDeps,
  ) {}

  async execute(command: UpdateReconciliationRuleCommand): Promise<ReconciliationRuleWriteResult> {
    const { organizationId, id, isActive, applyToExisting, ...changes } = command;
    const current = await this.ruleRepo.findById(organizationId, id);
    if (!current) throw new RuleNotFoundError(id);

    let rule = current.edit(changes);
    if (isActive === true && !rule.isActive) rule = rule.activate();
    if (isActive === false && rule.isActive) rule = rule.deactivate();
    if (rule.isActive) {
      await assertRecurrenceRule(organizationId, rule, {
        ruleRepo: this.ruleRepo,
        movementRepo: this.backfill.movementRepo,
        target: this.backfill.recurrenceLinking?.target,
        occurrenceRead: this.backfill.occurrenceRead,
      });
    }
    await this.ruleRepo.update(organizationId, rule);

    const appliedCount =
      applyToExisting && rule.isActive && rule.bankAccountId
        ? await applyRulesToAccount(this.backfill, organizationId, rule.bankAccountId, [rule])
        : 0;
    return { ...ruleToDto(rule), appliedCount };
  }
}
