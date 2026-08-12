import type {
  SupplierInvoiceFilter,
  SupplierInvoiceRow,
  SupplierInvoiceStats,
  SupplierInvoiceStatsPort,
} from "../../domain/ports/out/supplier-invoice-stats.port.js";

export class FakeSupplierInvoiceStats implements SupplierInvoiceStatsPort {
  private readonly summaries = new Map<string, SupplierInvoiceStats>();
  private readonly invoiceRows = new Map<string, SupplierInvoiceRow[]>();

  seed(stats: SupplierInvoiceStats, invoices?: SupplierInvoiceRow[]): void {
    this.summaries.set(stats.supplierId, stats);
    if (invoices) this.invoiceRows.set(stats.supplierId, invoices);
  }

  async getSummariesForSuppliers(supplierIds: string[]): Promise<SupplierInvoiceStats[]> {
    return supplierIds.map(
      (id) =>
        this.summaries.get(id) ?? {
          supplierId: id,
          invoiceCount: 0,
          totalBilled: 0,
          totalPaid: 0,
          totalPending: 0,
          lastInvoiceDate: null,
          lastPaymentDate: null,
        },
    );
  }

  async listInvoicesBySupplier(supplierId: string, filter?: SupplierInvoiceFilter): Promise<SupplierInvoiceRow[]> {
    const rows = this.invoiceRows.get(supplierId) ?? [];
    if (!filter) return rows;
    return rows.filter((r) => {
      if (filter.startDate && r.invoiceDate < filter.startDate) return false;
      if (filter.endDate && r.invoiceDate > filter.endDate) return false;
      return true;
    });
  }
}
