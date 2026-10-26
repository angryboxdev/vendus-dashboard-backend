import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Cross-module output port — declarado aqui, implementado por adapter Supabase
 * que acede directamente à tabela invoices (sem importar o módulo invoices).
 *
 * Contém apenas os campos necessários para vincular uma fatura a uma ocorrência.
 */
export interface InvoiceSnapshot {
  id: string;
  supplierId: string | null;
  supplierName: string;
  /** Data de emissão (YYYY-MM-DD) — escolhe o mês da ocorrência na associação automática. */
  invoiceDate: string;
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
  /** "invoice" | "credit_note" | … — notas de crédito nunca se associam sozinhas. */
  documentType: string;
  totalWithVatCents: number;
  dueDate: string | null; // YYYY-MM-DD
  status: string;
  paidAt: string | null; // ISO timestamp
  /** Documento de pagamento com várias faturas fiscais (ex.: águas + resíduos): as do mesmo documento partilham o id. */
  paymentGroupId: string | null;
}

export interface InvoiceReadPort {
  findById(organizationId: OrganizationId, id: string): Promise<InvoiceSnapshot | null>;
  /**
   * Para cada fatura pedida, as faturas do seu documento de pagamento (ela incluída), sem as
   * canceladas; sem grupo, só ela. Faturas inexistentes ficam de fora do mapa.
   */
  findPaymentGroupMembers(organizationId: OrganizationId, invoiceIds: string[]): Promise<Map<string, InvoiceSnapshot[]>>;
  /** Faturas (não canceladas) de um documento de pagamento. */
  findByPaymentGroup(organizationId: OrganizationId, paymentGroupId: string): Promise<InvoiceSnapshot[]>;
}
