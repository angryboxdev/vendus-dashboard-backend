import { Recurrence } from "../entities/recurrence.js";
import { RecurrenceOccurrence, type OccurrencePeriod } from "../entities/recurrence-occurrence.js";

/**
 * Pure domain service — no dependencies on infrastructure.
 *
 * Responsible for computing whether a recurrence should generate an occurrence
 * for a given month, and building that occurrence if so.
 */
export class OccurrenceGeneratorService {
  /**
   * Generates an occurrence for the given year/month if the recurrence is
   * active and in scope. Returns null if the recurrence should not produce an
   * occurrence for that month.
   *
   * Rules:
   * - Recurrence must have status "active".
   * - The month being generated must not end before startDate.
   * - The month being generated must not start after endDate (when set).
   * - Only "monthly" frequency is supported in the MVP; quarterly/annual return null.
   */
  generateForMonth(
    recurrence: Recurrence,
    year: number,
    month: number, // 1-based (1 = January)
  ): RecurrenceOccurrence | null {
    if (recurrence.status !== "active") return null;

    const firstOfMonth = new Date(year, month - 1, 1);
    const lastOfMonth = new Date(year, month, 0); // day 0 of next month = last day of this month

    // Recurrence hasn't started yet (startDate is after the last day of this month)
    if (recurrence.startDate > lastOfMonth) return null;

    // Recurrence already ended (endDate is before the first day of this month)
    if (recurrence.endDate && recurrence.endDate < firstOfMonth) return null;

    // Frequency check — only generate when this month falls in the recurrence cycle
    if (!this.isInFrequency(recurrence, year, month)) return null;

    const dueDate = this.computeDueDate(year, month, recurrence.dayOfMonth);
    const period = this.toPeriod(year, month);

    return RecurrenceOccurrence.create({
      recurrenceId: recurrence.id,
      period,
      estimatedAmountCents: recurrence.estimatedAmountCents,
      dueDate,
      requireInvoice: recurrence.requireInvoice,
    });
  }

  /**
   * Returns the YYYY-MM string for a given year and 1-based month.
   */
  toPeriod(year: number, month: number): OccurrencePeriod {
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  /**
   * Returns true if the given year/month falls within the recurrence's frequency cycle.
   * The cycle starts from recurrence.startDate's month.
   *
   * - monthly:   always true (scope check already handled above)
   * - quarterly: every 3 months from startDate's month
   * - annual:    every 12 months from startDate's month (same calendar month each year)
   */
  private isInFrequency(recurrence: Recurrence, year: number, month: number): boolean {
    const startYear = recurrence.startDate.getFullYear();
    const startMonth = recurrence.startDate.getMonth(); // 0-based
    const monthsSinceStart = (year - startYear) * 12 + (month - 1) - startMonth;

    if (monthsSinceStart < 0) return false;

    switch (recurrence.frequency) {
      case "monthly":   return true;
      case "quarterly": return monthsSinceStart % 3 === 0;
      case "annual":    return monthsSinceStart % 12 === 0;
    }
  }

  /**
   * Computes the due date for a month. Caps dayOfMonth to the actual last day
   * of the month (e.g. dayOfMonth=31 in February becomes the 28th/29th).
   */
  private computeDueDate(year: number, month: number, dayOfMonth: number): Date {
    const lastDay = new Date(year, month, 0).getDate();
    const day = Math.min(dayOfMonth, lastDay);
    return new Date(year, month - 1, day);
  }
}
