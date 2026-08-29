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
