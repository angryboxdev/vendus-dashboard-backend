import type {
  PayableEntryMatchCandidate,
  PayableEntryMatchReadPort,
} from "../../domain/ports/out/payable-entry-match-read.port.js";

export class FakePayableEntryMatchRead implements PayableEntryMatchReadPort {
  private candidates: PayableEntryMatchCandidate[] = [];

  setCandidates(candidates: PayableEntryMatchCandidate[]): void {
    this.candidates = candidates;
  }

  async findByIds(ids: string[]): Promise<PayableEntryMatchCandidate[]> {
    return this.candidates.filter((c) => ids.includes(c.id));
  }

  async findCandidates(opts: {
    amountCents: number;
    dateFrom: string;
    dateTo: string;
    toleranceCents?: number;
  }): Promise<PayableEntryMatchCandidate[]> {
    const tolerance = opts.toleranceCents ?? 0;
    return this.candidates.filter(
      (c) => Math.abs(c.amount - opts.amountCents) <= tolerance
    );
  }
}
