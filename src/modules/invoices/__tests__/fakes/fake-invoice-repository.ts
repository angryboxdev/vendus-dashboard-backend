import type { Invoice } from "../../domain/entities/invoice.js";
import type { InvoiceFilter, InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";

export class FakeInvoiceRepository implements InvoiceRepositoryPort {
  private store = new Map<string, Invoice>();

  async save(invoice: Invoice): Promise<void> {
    this.store.set(invoice.id, invoice);
  }

  async findById(id: string): Promise<Invoice | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(filter?: InvoiceFilter): Promise<Invoice[]> {
    let result = [...this.store.values()];
    if (filter?.supplierId) result = result.filter((i) => i.supplierId === filter.supplierId);
    if (filter?.status) result = result.filter((i) => i.status === filter.status);
    if (filter?.isDirectDebit !== undefined) result = result.filter((i) => i.isDirectDebit === filter.isDirectDebit);
    if (filter?.from) {
      const from = filter.from;
      result = result.filter((i) => i.invoiceDate >= from);
    }
    if (filter?.to) {
      const to = filter.to;
      result = result.filter((i) => i.invoiceDate <= to);
    }
    return result.sort((a, b) => b.invoiceDate.getTime() - a.invoiceDate.getTime());
  }

  async update(invoice: Invoice): Promise<void> {
    this.store.set(invoice.id, invoice);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async findDuplicate(invoiceNumber: string, supplierId: string, excludeId?: string): Promise<Invoice | null> {
    for (const inv of this.store.values()) {
      if (inv.invoiceNumber === invoiceNumber && inv.supplierId === supplierId && inv.status !== "cancelled") {
        if (excludeId && inv.id === excludeId) continue;
        return inv;
      }
    }
    return null;
  }

  async findDuplicateByNif(invoiceNumber: string, supplierNif: string, excludeId?: string): Promise<Invoice | null> {
    for (const inv of this.store.values()) {
      if (inv.invoiceNumber === invoiceNumber && inv.supplierNifSnapshot === supplierNif && inv.status !== "cancelled") {
        if (excludeId && inv.id === excludeId) continue;
        return inv;
      }
    }
    return null;
  }

  async findPendingDirectDebits(): Promise<Invoice[]> {
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
