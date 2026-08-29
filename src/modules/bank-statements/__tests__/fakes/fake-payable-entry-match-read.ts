import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  PayableEntryMatchCandidate,
  PayableEntryMatchReadPort,
} from "../../domain/ports/out/payable-entry-match-read.port.js";

export class FakePayableEntryMatchRead implements PayableEntryMatchReadPort {
  private candidates = new Map<OrganizationId, PayableEntryMatchCandidate[]>();

  setCandidates(organizationId: OrganizationId, candidates: PayableEntryMatchCandidate[]): void {
    this.candidates.set(organizationId, candidates);
  }

  async findByIds(
    organizationId: OrganizationId,
    ids: string[]
  ): Promise<PayableEntryMatchCandidate[]> {
    return (this.candidates.get(organizationId) ?? []).filter((c) => ids.includes(c.id));
  }

  async findCandidates(
    organizationId: OrganizationId,
    opts: {
      amountCents: number;
      dateFrom: string;
      dateTo: string;
      toleranceCents?: number;
    }
  ): Promise<PayableEntryMatchCandidate[]> {
    const tolerance = opts.toleranceCents ?? 0;
    return (this.candidates.get(organizationId) ?? []).filter(
      (c) => Math.abs(c.amount - opts.amountCents) <= tolerance
    );
  }
}
