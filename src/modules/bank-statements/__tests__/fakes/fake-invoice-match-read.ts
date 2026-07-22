import type {
  InvoiceMatchCandidate,
  InvoiceMatchReadPort,
} from "../../domain/ports/out/invoice-match-read.port.js";

export class FakeInvoiceMatchRead implements InvoiceMatchReadPort {
  private candidates: InvoiceMatchCandidate[] = [];

  setcandidates(candidates: InvoiceMatchCandidate[]): void {
    this.candidates = candidates;
  }

  async findByIds(ids: string[]): Promise<InvoiceMatchCandidate[]> {
    return this.candidates.filter((c) => ids.includes(c.id));
  }

  async findCandidates(opts: {
    amountCents: number;
    dateFrom: string;
    dateTo: string;
    toleranceCents?: number;
  }): Promise<InvoiceMatchCandidate[]> {
    const tolerance = opts.toleranceCents ?? 0;
    return this.candidates.filter(
      (c) => Math.abs(c.totalWithVat - opts.amountCents) <= tolerance
    );
  }
}
