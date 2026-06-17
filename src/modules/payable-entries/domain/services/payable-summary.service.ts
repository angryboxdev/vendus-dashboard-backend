import type { PayableEntry } from "../entities/payable-entry.js";

export interface PayableSummary {
  totalDue: number;        // cents — pending + overdue
  totalOverdue: number;    // cents — overdue only
  dueSoon7Days: number;    // cents — pending, due within 7 days from today
  paidThisMonth: number;   // cents — paid in current calendar month
}

export interface PayableCalendarDay {
  date: string; // YYYY-MM-DD
  entries: PayableEntry[];
  totalAmount: number; // cents
}

export class PayableSummaryService {
  computeSummary(entries: PayableEntry[], today: Date): PayableSummary {
    const todayMs = today.getTime();
    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    let totalDue = 0;
    let totalOverdue = 0;
    let dueSoon7Days = 0;
    let paidThisMonth = 0;

    for (const entry of entries) {
      if (entry.status === "pending" || entry.status === "overdue") {
        totalDue += entry.amount;
      }

      if (entry.status === "overdue") {
        totalOverdue += entry.amount;
      }

      if (entry.status === "pending") {
        const dueMs = entry.dueDate.getTime();
        if (dueMs >= todayMs && dueMs <= in7Days.getTime()) {
          dueSoon7Days += entry.amount;
        }
      }

      if (
        entry.status === "paid" &&
        entry.paidAt !== null &&
        entry.paidAt >= monthStart &&
        entry.paidAt <= monthEnd
      ) {
        paidThisMonth += entry.amount;
      }
    }

    return { totalDue, totalOverdue, dueSoon7Days, paidThisMonth };
  }

  groupByDay(entries: PayableEntry[]): PayableCalendarDay[] {
    const map = new Map<string, PayableEntry[]>();

    for (const entry of entries) {
      const key = entry.dueDate.toISOString().slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }

    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayEntries]) => ({
        date,
        entries: dayEntries,
        totalAmount: dayEntries.reduce((sum, e) => sum + e.amount, 0),
      }));
  }
}
