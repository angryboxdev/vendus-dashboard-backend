import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Output port de leitura/escrita de faturas para o módulo payable-entries.
 * Declarado aqui para manter independência — o adapter concreto acede
 * directamente à tabela invoices via Supabase, sem importar código do
 * módulo invoices.
 */
export interface InvoiceSnapshot {
  id: string;
  supplierId: string | null;
  supplierName: string;
  invoiceNumber: string;
  dueDate: string | null; // YYYY-MM-DD
  totalWithVat: number;   // cents
  status: string;
}

export interface InvoiceReadPort {
  findById(organizationId: OrganizationId, id: string): Promise<InvoiceSnapshot | null>;
  /** Marca a fatura como paga quando o payable ligado é pago. */
  markPaid(organizationId: OrganizationId, invoiceId: string, paidAt: Date): Promise<void>;
}
