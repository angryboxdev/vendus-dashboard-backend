import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface SupplierInvoiceStats {
  supplierId: string;
  invoiceCount: number;
  totalBilled: number;
  totalPaid: number;
  totalPending: number;
  lastInvoiceDate: Date | null;
  lastPaymentDate: Date | null;
}

export interface SupplierInvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  totalWithoutVat: number;
  vatAmount: number;
  totalWithVat: number;
  status: string;
  paidAt: Date | null;
  attachmentUrl: string | null;
}

export interface SupplierInvoiceFilter {
  startDate?: Date;
  endDate?: Date;
}

export interface SupplierInvoiceStatsPort {
  /**
   * Agrega estatísticas financeiras de faturas para uma lista de fornecedores.
   * Fornecedores sem faturas são devolvidos com todos os valores a zero.
   */
  getSummariesForSuppliers(
    organizationId: OrganizationId,
    supplierIds: string[],
  ): Promise<SupplierInvoiceStats[]>;

  /**
   * Lista as faturas de um fornecedor (excluindo drafts em processamento).
   * Ordenadas por data de emissão descendente.
   * Aceita filtro opcional de intervalo de datas (por invoice_date).
   */
  listInvoicesBySupplier(
    organizationId: OrganizationId,
    supplierId: string,
    filter?: SupplierInvoiceFilter,
  ): Promise<SupplierInvoiceRow[]>;
}
