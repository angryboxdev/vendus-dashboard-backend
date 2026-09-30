import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Um pagamento real de uma fatura, confirmado por conciliação bancária —
 * não um "status=paid" assumido. Uma fatura pode ter zero, um ou vários
 * pagamentos (pagamentos parciais, várias tranches).
 */
export interface InvoicePayment {
  invoiceId: string;
  /**
   * O movimento bancário que originou esta alocação — permite ao
   * consumidor agrupar várias faturas/NC liquidadas de uma só vez (mesmo
   * `movementId`) num único evento de "Liquidação" no extrato, em vez de
   * mostrar N linhas para o que foi, na realidade, um único pagamento.
   */
  movementId: string;
  /** Data do movimento bancário que liquidou (total ou parcialmente) a fatura. */
  date: Date;
  /** Valor alocado desse movimento a esta fatura, em euros — sinal preservado (negativo para nota de crédito consumida na mesma liquidação). */
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
