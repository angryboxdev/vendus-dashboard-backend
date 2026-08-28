import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type {
  GetRecurrenceSummaryPort,
  GetRecurrenceSummaryQuery,
  RecurrenceSummaryDTO,
} from "../../domain/ports/in/occurrence.ports.js";

export class GetRecurrenceSummaryUseCase implements GetRecurrenceSummaryPort {
  constructor(private readonly occurrenceRepo: OccurrenceRepositoryPort) {}

  async execute(query: GetRecurrenceSummaryQuery): Promise<RecurrenceSummaryDTO> {
    const counts = await this.occurrenceRepo.countByStatus(query.organizationId);
    return {
      awaitingInvoiceCount: counts.awaiting_invoice ?? 0,
    };
  }
}
