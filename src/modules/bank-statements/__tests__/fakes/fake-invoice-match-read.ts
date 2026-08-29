import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  InvoiceMatchCandidate,
  InvoiceMatchReadPort,
} from "../../domain/ports/out/invoice-match-read.port.js";

export class FakeInvoiceMatchRead implements InvoiceMatchReadPort {
  private candidates = new Map<OrganizationId, InvoiceMatchCandidate[]>();

  setcandidates(organizationId: OrganizationId, candidates: InvoiceMatchCandidate[]): void {
    this.candidates.set(organizationId, candidates);
  }

  async findByIds(organizationId: OrganizationId, ids: string[]): Promise<InvoiceMatchCandidate[]> {
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
  ): Promise<InvoiceMatchCandidate[]> {
    const tolerance = opts.toleranceCents ?? 0;
    return (this.candidates.get(organizationId) ?? []).filter(
      (c) => Math.abs(c.totalWithVat - opts.amountCents) <= tolerance
    );
  }
}
