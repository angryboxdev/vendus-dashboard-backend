import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { GetRecurrenceSummaryPort, RecurrenceSummaryDTO } from "../../domain/ports/in/occurrence.ports.js";

export class GetRecurrenceSummaryUseCase implements GetRecurrenceSummaryPort {
  constructor(private readonly occurrenceRepo: OccurrenceRepositoryPort) {}

  async execute(): Promise<RecurrenceSummaryDTO> {
    const counts = await this.occurrenceRepo.countByStatus();
    return {
      awaitingInvoiceCount: counts.awaiting_invoice ?? 0,
    };
  }
}
