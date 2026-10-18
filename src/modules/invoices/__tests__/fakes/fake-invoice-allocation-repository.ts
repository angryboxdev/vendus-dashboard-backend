import type { InvoiceAllocation } from "../../domain/entities/invoice-allocation.js";
import type { InvoiceAllocationRepositoryPort } from "../../domain/ports/out/invoice-allocation-repository.port.js";

export class FakeInvoiceAllocationRepository implements InvoiceAllocationRepositoryPort {
  rows: InvoiceAllocation[] = [];

  async findByInvoiceId(_o: unknown, invoiceId: string) {
    return this.rows.filter((r) => r.invoiceId === invoiceId).sort((a, b) => a.position - b.position);
  }

  async findAll() {
    return [...this.rows];
  }

  async replaceForInvoice(_o: unknown, invoiceId: string, allocations: InvoiceAllocation[]) {
    this.rows = [...this.rows.filter((r) => r.invoiceId !== invoiceId), ...allocations];
  }
}
