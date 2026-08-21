import type {
  OccurrenceMatchCandidate,
  OccurrenceMatchReadPort,
} from "../../domain/ports/out/occurrence-match-read.port.js";

export class FakeOccurrenceMatchReadAdapter implements OccurrenceMatchReadPort {
  private candidates: OccurrenceMatchCandidate[] = [];

  seed(candidates: OccurrenceMatchCandidate[]): void {
    this.candidates = candidates;
  }

  async search(opts: {
    q?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): Promise<OccurrenceMatchCandidate[]> {
    let results = [...this.candidates].filter((c) => c.status !== "cancelled");

    if (opts.dateFrom) results = results.filter((c) => c.dueDate >= opts.dateFrom!);
    if (opts.dateTo)   results = results.filter((c) => c.dueDate <= opts.dateTo!);

    if (opts.q && opts.q.trim().length > 0) {
      const needle = opts.q.trim().toLowerCase();
      results = results.filter(
        (c) =>
          c.recurrenceName.toLowerCase().includes(needle) ||
          c.supplierName.toLowerCase().includes(needle),
      );
    }

    return results.slice(0, opts.limit ?? 50);
  }

  async findByIds(ids: string[]): Promise<OccurrenceMatchCandidate[]> {
    return this.candidates.filter((c) => ids.includes(c.id));
  }
}
