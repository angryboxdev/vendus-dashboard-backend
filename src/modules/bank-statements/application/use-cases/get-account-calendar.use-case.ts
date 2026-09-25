import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type {
  AccountMonthStat,
  GetAccountCalendarPort,
  GetAccountCalendarQuery,
} from "../../domain/ports/in/bank-statement.ports.js";
import { RESOLVED_STATUSES } from "../../domain/entities/bank-movement.js";

/** Ratio of resolved movements as a 0–100 percent. 100 when there's nothing to reconcile (division by zero would otherwise be meaningless, and an empty checklist is trivially "done"). */
function resolvedPercent(resolved: number, total: number): number {
  return total > 0 ? Math.round((resolved / total) * 100) : 100;
}

export class GetAccountCalendarUseCase implements GetAccountCalendarPort {
  constructor(private readonly movementRepo: BankMovementRepositoryPort) {}

  async execute({ organizationId, bankAccountId, year }: GetAccountCalendarQuery): Promise<AccountMonthStat[]> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1–12

    const from = new Date(year, 0, 1);  // Jan 1
    const to = new Date(year, 11, 31);  // Dec 31
    const movements = await this.movementRepo.findByAccountAndPeriod(organizationId, bankAccountId, from, to);

    // Group by month
    const byMonth = new Map<number, typeof movements>();
    for (const m of movements) {
      const month = m.bookingDate.getMonth() + 1;
      const arr = byMonth.get(month) ?? [];
      arr.push(m);
      byMonth.set(month, arr);
    }

    const maxMonth = year === currentYear ? currentMonth : 12;
    const result: AccountMonthStat[] = [];

    for (let month = 1; month <= maxMonth; month++) {
      const monthMovements = byMonth.get(month) ?? [];
      const totalMovements = monthMovements.length;
      const reconciledMovements = monthMovements.filter((m) =>
        RESOLVED_STATUSES.has(m.reconciliationStatus)
      ).length;

      const credits = monthMovements.filter((m) => m.movementType === "credit");
      const debits = monthMovements.filter((m) => m.movementType === "debit");
      const reconciledCredits = credits.filter((m) => RESOLVED_STATUSES.has(m.reconciliationStatus)).length;
      const reconciledDebits = debits.filter((m) => RESOLVED_STATUSES.has(m.reconciliationStatus)).length;
      const totalCreditCents = credits.reduce((s, m) => s + m.amount, 0);
      const totalDebitCents = debits.reduce((s, m) => s + m.amount, 0);

      result.push({
        year,
        month,
        totalMovements,
        reconciledMovements,
        salesReconciledPercent: resolvedPercent(reconciledCredits, credits.length),
        expensesReconciledPercent: resolvedPercent(reconciledDebits, debits.length),
        totalCreditCents,
        totalDebitCents,
        balanceCents: totalCreditCents - totalDebitCents,
      });
    }

    return result;
  }
}
