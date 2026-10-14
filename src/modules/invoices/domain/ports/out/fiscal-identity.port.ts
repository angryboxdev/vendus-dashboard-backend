import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Dados fiscais de uma fatura para a identidade partilhada Financeiro/Stock (task v1.2 §1.2). */
export interface InvoiceFiscalInput {
  legalEntityId: string | null;
  supplierNif: string | null;
  documentType: "invoice" | "credit_note";
  invoiceNumber: string | null;
  atcud: string | null;
}

export type InvoiceFiscalCheck =
  | { kind: "new" }
  | { kind: "ok"; identityId: string; linkedToStock: boolean }
  | { kind: "incomplete"; missing: string[] }
  | { kind: "existing_finance"; identityId: string; existingInvoiceId: string | null }
  | { kind: "existing_stock_only"; identityId: string }
  | { kind: "possible_duplicate"; candidates: { invoiceId: string | null; seriesNumber: string }[] };

export interface FiscalIdentityPort {
  /** Só leitura (aviso na importação). */
  check(org: OrganizationId, input: InvoiceFiscalInput): Promise<InvoiceFiscalCheck>;
  /** Reserva a identidade para a fatura (idempotente, seguro com pedidos simultâneos). */
  claim(org: OrganizationId, actor: string, input: InvoiceFiscalInput, invoiceId: string, opts?: { notADuplicate?: boolean; completeStockIdentityId?: string }): Promise<InvoiceFiscalCheck>;
  /** Fatura apagada: liberta a chave se o documento nunca chegou ao Stock. */
  release(org: OrganizationId, actor: string, invoiceId: string): Promise<void>;
}
