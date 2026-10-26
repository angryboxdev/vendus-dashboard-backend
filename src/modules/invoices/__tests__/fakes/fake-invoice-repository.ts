import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Invoice } from "../../domain/entities/invoice.js";
import type { InvoiceFilter, InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";

/**
 * A organização é apenas mais um parâmetro (D2) — este fake modela uma única
 * organização de cada vez, tal como as suítes que o usam; a filtragem por
 * organização é responsabilidade do helper (`ScopedQuery`), coberta pelos
 * seus próprios testes, não deste fake.
 */
export class FakeInvoiceRepository implements InvoiceRepositoryPort {
  private store = new Map<string, Invoice>();

  async save(_organizationId: OrganizationId, invoice: Invoice): Promise<void> {
    this.store.set(invoice.id, invoice);
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<Invoice | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(_organizationId: OrganizationId, filter?: InvoiceFilter): Promise<Invoice[]> {
    let result = [...this.store.values()];
    if (filter?.supplierId) result = result.filter((i) => i.supplierId === filter.supplierId);
    if (filter?.status) result = result.filter((i) => i.status === filter.status);
    if (filter?.reconciliationStatus) result = result.filter((i) => i.reconciliationStatus === filter.reconciliationStatus);
    if (filter?.isDirectDebit !== undefined) result = result.filter((i) => i.isDirectDebit === filter.isDirectDebit);
    if (filter?.documentType) result = result.filter((i) => i.documentType === filter.documentType);
    if (filter?.from) {
      const from = filter.from;
      result = result.filter((i) => i.invoiceDate >= from);
    }
    if (filter?.to) {
      const to = filter.to;
      result = result.filter((i) => i.invoiceDate <= to);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (i) =>
          i.supplierName.toLowerCase().includes(q) ||
          i.invoiceNumber.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime());
  }

  async update(_organizationId: OrganizationId, invoice: Invoice): Promise<void> {
    this.store.set(invoice.id, invoice);
  }

  hashes = new Map<string, string>();
  async findIdsByLineDetailMode(_organizationId: OrganizationId, modes: import("../../domain/entities/invoice.js").LineDetailMode[]): Promise<Set<string>> {
    return new Set([...this.store.values()].filter((i) => modes.includes(i.lineDetailMode)).map((i) => i.id));
  }
  async claimVersion(_organizationId: OrganizationId, invoiceId: string, expectedVersion: number | null): Promise<number | null> {
    const inv = this.store.get(invoiceId);
    if (!inv) return null;
    if (expectedVersion !== null && expectedVersion !== inv.version) return null;
    this.store.set(invoiceId, inv.withVersion(inv.version + 1));
    return inv.version + 1;
  }
  async findByFileHash(_organizationId: OrganizationId, sha256: string): Promise<Invoice | null> {
    for (const [id, h] of this.hashes) if (h === sha256) {
      const inv = await this.findById(_organizationId, id);
      if (inv && inv.status !== "cancelled") return inv;
    }
    return null;
  }
  async setFileHash(_organizationId: OrganizationId, invoiceId: string, sha256: string): Promise<void> {
    this.hashes.set(invoiceId, sha256);
  }

  /** invoiceId → grupo do documento de pagamento (a entidade não muda; os testes leem daqui). */
  paymentGroups = new Map<string, string>();
  async setPaymentGroup(_organizationId: OrganizationId, invoiceIds: string[], groupId: string): Promise<void> {
    for (const id of invoiceIds) this.paymentGroups.set(id, groupId);
  }
  async findByPaymentGroup(_organizationId: OrganizationId, groupId: string): Promise<Invoice[]> {
    return [...this.paymentGroups].filter(([, g]) => g === groupId).flatMap(([id]) => (this.store.has(id) ? [this.store.get(id)!] : []));
  }

  async delete(_organizationId: OrganizationId, id: string): Promise<void> {
    this.store.delete(id);
  }

  async findDuplicate(
    _organizationId: OrganizationId,
    invoiceNumber: string,
    supplierId: string,
    excludeId?: string,
  ): Promise<Invoice | null> {
    for (const inv of this.store.values()) {
      if (inv.invoiceNumber === invoiceNumber && inv.supplierId === supplierId && inv.status !== "cancelled") {
        if (excludeId && inv.id === excludeId) continue;
        return inv;
      }
    }
    return null;
  }

  async findDuplicateByNif(
    _organizationId: OrganizationId,
    invoiceNumber: string,
    supplierNif: string,
    excludeId?: string,
  ): Promise<Invoice | null> {
    for (const inv of this.store.values()) {
      if (inv.invoiceNumber === invoiceNumber && inv.supplierNifSnapshot === supplierNif && inv.status !== "cancelled") {
        if (excludeId && inv.id === excludeId) continue;
        return inv;
      }
    }
    return null;
  }

  async findPendingDirectDebits(_organizationId: OrganizationId): Promise<Invoice[]> {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return [...this.store.values()].filter(
      (inv) =>
        inv.isDirectDebit &&
        inv.directDebitDate !== null &&
        inv.directDebitDate <= today &&
        inv.status !== "paid" &&
        inv.status !== "cancelled",
    );
  }
}
