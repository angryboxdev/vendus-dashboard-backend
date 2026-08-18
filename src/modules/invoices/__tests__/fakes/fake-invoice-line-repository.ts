import type { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";

export class FakeInvoiceLineRepository implements InvoiceLineRepositoryPort {
  private store = new Map<string, InvoiceLine>();

  async saveAll(lines: InvoiceLine[]): Promise<void> {
    for (const line of lines) {
      this.store.set(line.id, line);
    }
  }

  async findAll(): Promise<InvoiceLine[]> {
    return [...this.store.values()];
  }

  async findByInvoiceId(invoiceId: string): Promise<InvoiceLine[]> {
    return [...this.store.values()].filter((l) => l.invoiceId === invoiceId);
  }

  async updateLine(line: InvoiceLine): Promise<void> {
    this.store.set(line.id, line);
  }

  async deleteByInvoiceId(invoiceId: string): Promise<void> {
    for (const [id, line] of this.store) {
      if (line.invoiceId === invoiceId) this.store.delete(id);
    }
  }

  async deleteLineById(lineId: string): Promise<void> {
    this.store.delete(lineId);
  }

  async updateCostCenterCategoryForInvoice(invoiceId: string, categoryId: string | null): Promise<void> {
    for (const [id, line] of this.store) {
      if (line.invoiceId === invoiceId) {
        // InvoiceLine is immutable — reconstitute with updated field
        this.store.set(id, line.classify({ costCenterCategoryId: categoryId }));
      }
    }
  }
}
