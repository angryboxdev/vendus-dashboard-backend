import { type BankMovement, RESOLVED_STATUSES, type ReconciliationStatus } from "../entities/bank-movement.js";

export interface ReconciliationStats {
  calculatedClosingBalance: number; // cents
  reconciliationProgress: number; // 0–100
  resolvedCount: number;
  totalCount: number;
  statusCounts: Partial<Record<ReconciliationStatus, number>>;
}

/**
 * Pure domain service — no I/O.
 * Computes reconciliation stats from a list of movements.
 */
export class ReconciliationCalculatorService {
  compute(openingBalance: number, movements: BankMovement[]): ReconciliationStats {
    let calculatedClosingBalance = openingBalance;
    let resolvedCount = 0;
    const statusCounts: Partial<Record<ReconciliationStatus, number>> = {};

    for (const m of movements) {
      if (m.movementType === "credit") {
        calculatedClosingBalance += m.amount;
      } else {
        calculatedClosingBalance -= m.amount;
      }

      statusCounts[m.reconciliationStatus] =
        (statusCounts[m.reconciliationStatus] ?? 0) + 1;

      if (RESOLVED_STATUSES.has(m.reconciliationStatus)) {
        resolvedCount++;
      }
    }

    const reconciliationProgress =
      movements.length > 0
        ? Math.round((resolvedCount / movements.length) * 100)
        : 0;

    return {
      calculatedClosingBalance,
      reconciliationProgress,
      resolvedCount,
      totalCount: movements.length,
      statusCounts,
    };
  }
}
