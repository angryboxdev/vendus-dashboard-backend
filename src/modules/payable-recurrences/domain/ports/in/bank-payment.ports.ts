import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Pagamento de uma ocorrência pela conciliação bancária (para o módulo bank-statements, ligado em
 * server.ts): quando um movimento fica ligado a uma ocorrência, ela passa a «paga» com a data do
 * movimento — mesmo com valor diferente do previsto (a diferença real vs previsto continua visível pelos
 * movimentos ligados); quando o movimento é desconciliado, volta a «por pagar».
 */
export interface SettleOccurrenceFromBankCommand {
  organizationId: OrganizationId;
  occurrenceId: string;
  movementId: string;
  /** Data do movimento (YYYY-MM-DD). */
  paidAt: string;
  bankAccountId: string | null;
}

/**
 * - `paid`: ficou paga agora.
 * - `already_paid`: já estava paga (ex.: segundo movimento do mesmo mês — fica ligado e soma ao real).
 * - `skipped`: não existe ou está cancelada.
 * - `invoice_required`: tem fatura associada ou exige fatura — o movimento concilia-se com a FATURA (que paga a
 *   ocorrência em cadeia); ligá-lo à ocorrência deixaria a fatura e a conta a pagar em aberto (pagamento duplicado).
 */
export type SettleOccurrenceFromBankResult = "paid" | "already_paid" | "skipped" | "invoice_required";

export interface SettleOccurrenceFromBankPort {
  execute(command: SettleOccurrenceFromBankCommand): Promise<SettleOccurrenceFromBankResult>;
}

export interface ReopenOccurrenceFromBankCommand {
  organizationId: OrganizationId;
  occurrenceId: string;
  movementId: string;
}

export interface ReopenOccurrenceFromBankPort {
  /** Só reabre se foi paga por ESTE movimento (nunca desfaz um pagamento feito por outra via). */
  execute(command: ReopenOccurrenceFromBankCommand): Promise<boolean>;
}
