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

export interface SettleOccurrenceFromBankPort {
  /** `true` se ficou paga agora; `false` se já estava paga, cancelada ou precisa de fatura primeiro. */
  execute(command: SettleOccurrenceFromBankCommand): Promise<boolean>;
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
