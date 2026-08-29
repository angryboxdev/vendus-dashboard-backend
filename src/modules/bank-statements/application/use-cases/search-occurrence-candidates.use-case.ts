import type { OccurrenceMatchReadPort } from "../../domain/ports/out/occurrence-match-read.port.js";
import type {
  OccurrenceCandidateDto,
  SearchOccurrenceCandidatesPort,
  SearchOccurrenceCandidatesQuery,
} from "../../domain/ports/in/bank-statement.ports.js";

export class SearchOccurrenceCandidatesUseCase implements SearchOccurrenceCandidatesPort {
  constructor(private readonly occurrenceRead: OccurrenceMatchReadPort) {}

  async execute(query: SearchOccurrenceCandidatesQuery): Promise<OccurrenceCandidateDto[]> {
    const opts: Parameters<typeof this.occurrenceRead.search>[1] = {
      limit: query.limit ?? 50,
    };
    if (query.q) opts.q = query.q;
    if (query.dateFrom) opts.dateFrom = query.dateFrom;
    if (query.dateTo) opts.dateTo = query.dateTo;
    const results = await this.occurrenceRead.search(query.organizationId, opts);

    return results.map((o) => ({
      id: o.id,
      recurrenceId: o.recurrenceId,
      recurrenceName: o.recurrenceName,
      supplierId: o.supplierId,
      supplierName: o.supplierName,
      period: o.period,
      effectiveAmountCents: o.effectiveAmountCents,
      dueDate: o.dueDate,
      status: o.status,
    }));
  }
}
