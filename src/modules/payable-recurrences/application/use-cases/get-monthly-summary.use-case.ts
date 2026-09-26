import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { BankMovementLinkReadPort } from "../../domain/ports/out/bank-movement-link-read.port.js";
import type { InvoiceAllocatedAmountReadPort } from "../../domain/ports/out/invoice-allocated-amount-read.port.js";
import type {
  GetMonthlySummaryPort,
  GetMonthlySummaryQuery,
  RecurrenceMonthlySummaryDTO,
} from "../../domain/ports/in/occurrence.ports.js";
import { DISPLAY_STATE_TOLERANCE_CENTS } from "../../domain/entities/recurrence-occurrence.js";
import { OccurrenceGeneratorService } from "../../domain/services/occurrence-generator.service.js";
import { enrichOccurrencesWithPayments, ensureOccurrencesForPeriod, fromLocalDateString } from "./shared.js";

const generator = new OccurrenceGeneratorService();

/**
 * Aggregate KPIs across ALL recurrences for a given month (spec §1/§6/§12).
 * First ensures every active recurrence has a real, persisted occurrence for
 * this period (`ensureOccurrencesForPeriod` — idempotent) — a "read" endpoint
 * with a deliberate side effect, because the reconciliation search needs a
 * real occurrence id to link a bank movement to; a purely virtual/in-memory
 * computation (this use-case's original design) isn't enough for that flow.
 * See README D12.
 */
export class GetMonthlySummaryUseCase implements GetMonthlySummaryPort {
  constructor(
    private readonly recurrenceRepo: RecurrenceRepositoryPort,
    private readonly occurrenceRepo: OccurrenceRepositoryPort,
    private readonly bankMovementLinkRead: BankMovementLinkReadPort,
    private readonly invoiceAllocatedAmountRead: InvoiceAllocatedAmountReadPort,
  ) {}

  async execute(query: GetMonthlySummaryQuery): Promise<RecurrenceMonthlySummaryDTO> {
    const { organizationId, period } = query;
    const periodParts = period.split("-").map(Number);
    const year = periodParts[0]!;
    const month = periodParts[1]!;

    await ensureOccurrencesForPeriod(organizationId, year, month, this.recurrenceRepo, this.occurrenceRepo);

    const [rawOccurrences, activeRecurrences] = await Promise.all([
      this.occurrenceRepo.findAll(organizationId, { period }),
      this.recurrenceRepo.findAll(organizationId, { status: "active" }),
    ]);

    const occurrences = await enrichOccurrencesWithPayments(
      rawOccurrences,
      this.bankMovementLinkRead,
      this.invoiceAllocatedAmountRead,
      organizationId,
    );

    const summary: RecurrenceMonthlySummaryDTO = {
      period,
      activeRecurrencesCount: activeRecurrences.filter((r) => generator.isActiveInMonth(r, year, month)).length,
      forecastedAmountCents: 0,
      paidAmountCents: 0,
      pendingCount: 0,
      pendingAmountCents: 0,
      overdueCount: 0,
      overdueAmountCents: 0,
      paidVsForecastedPercent: null,
    };

    const today = new Date();
    // `isSettled` (not just "remaining <= tolerance") mirrors
    // computeOccurrenceDisplayState's own precedence: an occurrence marked
    // paid directly (e.g. cash payment via markOccurrenceAsPaid, no bank
    // movement behind it) has paidAmountCents=0 but must still count as
    // resolved here, never as pending/overdue.
    const bucket = (effectiveAmountCents: number, paidAmountCents: number, dueDate: Date, isSettled: boolean) => {
      summary.forecastedAmountCents += effectiveAmountCents;
      summary.paidAmountCents += paidAmountCents;
      if (isSettled) return;

      const remaining = effectiveAmountCents - paidAmountCents;
      if (remaining <= DISPLAY_STATE_TOLERANCE_CENTS) return; // fully paid, nothing pending

      const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (dueDateOnly < todayOnly) {
        summary.overdueCount += 1;
        summary.overdueAmountCents += remaining;
      } else {
        summary.pendingCount += 1;
        summary.pendingAmountCents += remaining;
      }
    };

    for (const occ of occurrences) {
      if (occ.status === "cancelled") continue;
      bucket(occ.effectiveAmountCents, occ.paidAmountCents, fromLocalDateString(occ.dueDate), occ.displayState === "paid");
    }

    if (
      summary.pendingCount === 0 &&
      summary.overdueCount === 0 &&
      summary.forecastedAmountCents > 0
    ) {
      summary.paidVsForecastedPercent =
        ((summary.paidAmountCents - summary.forecastedAmountCents) / summary.forecastedAmountCents) * 100;
    }

    return summary;
  }
}
