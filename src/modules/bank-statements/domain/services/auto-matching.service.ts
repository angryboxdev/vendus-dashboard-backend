import type { BankMovement } from "../entities/bank-movement.js";
import type { BankReconciliationRule } from "../entities/bank-reconciliation-rule.js";

/**
 * Pure domain service — no I/O.
 * Finds the first active rule that matches a bank movement.
 *
 * Matching criteria (all must pass):
 *   1. Rule is active.
 *   2. If rule.movementType is set, it must match the movement type.
 *   3. movement.description (case-insensitive) must contain rule.descriptionContains.
 */
export class AutoMatchingService {
  matchRule(
    rules: BankReconciliationRule[],
    movement: BankMovement
  ): BankReconciliationRule | null {
    const desc = movement.description.toLowerCase();

    for (const rule of rules) {
      if (!rule.isActive) continue;
      if (rule.movementType !== null && rule.movementType !== movement.movementType) continue;
      if (!desc.includes(rule.descriptionContains.toLowerCase())) continue;
      return rule;
    }

    return null;
  }

  /**
   * Applies rules to a list of movements.
   * Returns only the movements that were matched (with their updated state).
   */
  applyRules(
    rules: BankReconciliationRule[],
    movements: BankMovement[]
  ): Array<{ original: BankMovement; updated: BankMovement; rule: BankReconciliationRule }> {
    const results: Array<{
      original: BankMovement;
      updated: BankMovement;
      rule: BankReconciliationRule;
    }> = [];

    for (const movement of movements) {
      // Skip movements already resolved
      if (movement.isResolved) continue;

      const rule = this.matchRule(rules, movement);
      if (!rule) continue;

      const updated = movement.classify({
        justificationType: rule.justificationType,
        riskLevel: rule.riskLevel,
      });

      results.push({ original: movement, updated, rule });
    }

    return results;
  }
}
