import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface InvoiceFinalizedForStockLineData {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unitCostWithoutVat: number;
  totalWithVat: number;
  /** F3a: IVA da linha (líquido com descontos = total − IVA). */
  vatAmount: number;
  supplierItemCode: string | null;
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
  /** F3c: `stock` = importada no Stock (cria a revisão, pendente do Financeiro). */
  origin?: "finance" | "stock";
  /** F3a: totais (cêntimos) para a conferência do documento no Stock. */
  subtotalWithoutVat: number;
  totalVat: number;
  totalWithVat: number;
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
