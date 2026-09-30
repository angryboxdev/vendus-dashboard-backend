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
      (c) => c.documentType === "invoice" && Math.abs(c.totalWithVat - opts.amountCents) <= tolerance
    );
  }

  async findBySupplier(
    organizationId: OrganizationId,
    opts: { supplierId: string; currency: string; maxDate: string }
  ): Promise<InvoiceMatchCandidate[]> {
    // Mirrors the adapter's `.neq("reconciliation_status", "reconciled")`.
    // The DTO doesn't carry reconciliation_status (it's a write-only concern
    // in this module — see InvoiceReconciliationWritePort), so tests express
    // "already fully reconciled" simply by not including that fixture, or by
    // giving it an open balance of 0 via the fake link repository — both are
    // filtered out by the use case's own open-balance check regardless.
    return (this.candidates.get(organizationId) ?? []).filter(
      (c) => c.supplierId === opts.supplierId && c.currency === opts.currency && c.invoiceDate <= opts.maxDate
    );
  }
}
