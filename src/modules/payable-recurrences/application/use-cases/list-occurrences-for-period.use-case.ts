import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { BankMovementLinkReadPort } from "../../domain/ports/out/bank-movement-link-read.port.js";
import type { InvoiceAllocatedAmountReadPort } from "../../domain/ports/out/invoice-allocated-amount-read.port.js";
import type {
  ListOccurrencesForPeriodPort,
  ListOccurrencesForPeriodQuery,
  OccurrenceDTO,
} from "../../domain/ports/in/occurrence.ports.js";
import { enrichOccurrencesWithPayments, ensureOccurrencesForPeriod } from "./shared.js";

/**
 * Cross-recurrence occurrence listing for a period — backs the "Ocorrências
 * do mês" table in the vista mensal. Ensures the month's occurrences really
 * exist first (same as GetMonthlySummaryUseCase — see README D12), so this
 * always matches what the KPIs show.
 */
export class ListOccurrencesForPeriodUseCase implements ListOccurrencesForPeriodPort {
  constructor(
    private readonly recurrenceRepo: RecurrenceRepositoryPort,
    private readonly occurrenceRepo: OccurrenceRepositoryPort,
    private readonly bankMovementLinkRead: BankMovementLinkReadPort,
    private readonly invoiceAllocatedAmountRead: InvoiceAllocatedAmountReadPort,
  ) {}

  async execute(query: ListOccurrencesForPeriodQuery): Promise<OccurrenceDTO[]> {
    const { organizationId, period } = query;
    const periodParts = period.split("-").map(Number);
    const year = periodParts[0]!;
    const month = periodParts[1]!;

    await ensureOccurrencesForPeriod(organizationId, year, month, this.recurrenceRepo, this.occurrenceRepo);

    const occurrences = await this.occurrenceRepo.findAll(organizationId, { period });
    return enrichOccurrencesWithPayments(
      occurrences,
      this.bankMovementLinkRead,
      this.invoiceAllocatedAmountRead,
      organizationId,
    );
  }
}
