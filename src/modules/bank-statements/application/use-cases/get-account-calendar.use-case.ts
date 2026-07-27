import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type {
  AccountMonthStat,
  GetAccountCalendarPort,
  GetAccountCalendarQuery,
} from "../../domain/ports/in/bank-statement.ports.js";
import { RESOLVED_STATUSES } from "../../domain/entities/bank-movement.js";

function daysInMonth(year: number, month: number): number {
  // month is 1–12; new Date(year, month, 0) = last day of that month
  return new Date(year, month, 0).getDate();
}

export class GetAccountCalendarUseCase implements GetAccountCalendarPort {
  constructor(private readonly movementRepo: BankMovementRepositoryPort) {}

  async execute({ bankAccountId, year }: GetAccountCalendarQuery): Promise<AccountMonthStat[]> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1–12

    const from = new Date(year, 0, 1);  // Jan 1
    const to = new Date(year, 11, 31);  // Dec 31
    const movements = await this.movementRepo.findByAccountAndPeriod(bankAccountId, from, to);

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
      const totalDays = daysInMonth(year, month);
      const coveredDays = new Set(
        monthMovements.map((m) => m.bookingDate.toISOString().slice(0, 10))
      ).size;
      const totalMovements = monthMovements.length;
      const reconciledMovements = monthMovements.filter((m) =>
        RESOLVED_STATUSES.has(m.reconciliationStatus)
      ).length;
      const coveragePercent =
        totalDays > 0 ? Math.round((coveredDays / totalDays) * 100) : 0;
      const reconciliationPercent =
        totalMovements > 0
          ? Math.round((reconciledMovements / totalMovements) * 100)
          : 0;

      result.push({
        year,
        month,
        totalDays,
        coveredDays,
        totalMovements,
        reconciledMovements,
        coveragePercent,
        reconciliationPercent,
      });
    }

    return result;
  }
}
