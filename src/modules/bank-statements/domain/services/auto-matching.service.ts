import type { BankMovement } from "../entities/bank-movement.js";
import type { BankReconciliationRule } from "../entities/bank-reconciliation-rule.js";
import { recurringMatchText } from "../utils/bank-description.js";

/** Ordem de preferência quando várias regras servem: conta própria, valor fixo, texto mais longo. */
function specificity(rule: BankReconciliationRule): number {
  return (
    (rule.bankAccountId !== null ? 1_000_000 : 0) +
    (rule.amountCents !== null ? 100_000 : 0) +
    recurringMatchText(rule.descriptionContains).length
  );
}

/**
 * Pure domain service — no I/O.
 * Finds the rule («movimento recorrente») that matches a bank movement.
 *
 * Matching criteria (all must pass):
 *   1. Rule is automatic (active, justification other than «fatura»/«sem justificativa»).
 *   2. If rule.bankAccountId is set, it must be the movement's account.
 *   3. If rule.movementType is set, it must match the movement type.
 *   4. The movement's description contains the rule's text as whole words, both compared through
 *      `recurringMatchText` (normalized, without words that carry digits — they change every month).
 *   5. If rule.amountCents is set, |amount − rule.amountCents| ≤ rule.amountToleranceCents.
 * When several rules match, the most specific wins (see `specificity`).
 */
export class AutoMatchingService {
  matchRule(rules: BankReconciliationRule[], movement: BankMovement): BankReconciliationRule | null {
    const desc = ` ${recurringMatchText(movement.description)} `;
    let best: BankReconciliationRule | null = null;

    for (const rule of rules) {
      if (!rule.isAutomatic) continue;
      if (rule.bankAccountId !== null && rule.bankAccountId !== movement.bankAccountId) continue;
      if (rule.movementType !== null && rule.movementType !== movement.movementType) continue;
      const needle = recurringMatchText(rule.descriptionContains);
      if (!needle || !desc.includes(` ${needle} `)) continue;
      if (rule.amountCents !== null && Math.abs(movement.amount - rule.amountCents) > rule.amountToleranceCents) continue;
      if (!best || specificity(rule) > specificity(best)) best = rule;
    }

    return best;
  }

  /**
   * Applies rules to a list of movements.
   * Only untouched movements (`BankMovement.isUntouched`) are considered; returns the ones that matched.
   */
  applyRules(
    rules: BankReconciliationRule[],
    movements: BankMovement[]
  ): Array<{ original: BankMovement; updated: BankMovement; rule: BankReconciliationRule }> {
    const results: Array<{ original: BankMovement; updated: BankMovement; rule: BankReconciliationRule }> = [];
    if (rules.length === 0) return results;

    for (const movement of movements) {
      if (!movement.isUntouched) continue;
      const rule = this.matchRule(rules, movement);
      if (!rule) continue;
      results.push({ original: movement, updated: movement.classifyByRule(rule), rule });
    }

    return results;
  }
}
