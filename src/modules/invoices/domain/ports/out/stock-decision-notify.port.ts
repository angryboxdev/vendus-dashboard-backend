import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface InvoiceFinalizedForStockLineData {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unitCostWithoutVat: number;
  totalWithVat: number;
  costCenterCategoryId: string | null;
  locationId: string | null;
}

export interface InvoiceFinalizedForStockData {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplierId: string | null;
  supplierName: string;
  supplierNif: string | null;
  override: "auto" | "force_create" | "force_skip";
  overrideReason: string | null;
  lines: InvoiceFinalizedForStockLineData[];
  actor: string | null;
}

/**
 * Gancho fire-and-forget para o módulo `stock-purchase-review` (D10, escrita
 * — implementado por um adapter que delega para o input port desse módulo).
 * Uma falha aqui NUNCA pode bloquear o lançamento da fatura; a varredura de
 * recuperação desse módulo reprocessa qualquer falha/omissão mais tarde.
 */
export interface StockDecisionNotifyPort {
  notifyInvoiceFinalized(organizationId: OrganizationId, data: InvoiceFinalizedForStockData): Promise<void>;
}
