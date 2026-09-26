import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Um pagamento real de uma fatura, confirmado por conciliação bancária —
 * não um "status=paid" assumido. Uma fatura pode ter zero, um ou vários
 * pagamentos (pagamentos parciais, várias tranches).
 */
export interface InvoicePayment {
  invoiceId: string;
  /** Data do movimento bancário que liquidou (total ou parcialmente) a fatura. */
  date: Date;
  /** Valor alocado desse movimento a esta fatura, em euros (mesma unidade que o resto deste DTO — ver SupplierInvoiceRowDTO). */
  amount: number;
}

/**
 * Cross-module: lê `bank_movement_entity_links` + `bank_movements` do módulo
 * `bank-statements` diretamente, sem importar código de lá (D10) — mesmo
 * padrão do `SupabaseOccurrenceMatchReadAdapter` noutro módulo.
 */
export interface InvoicePaymentReadPort {
  findByInvoiceIds(organizationId: OrganizationId, invoiceIds: string[]): Promise<InvoicePayment[]>;
}
