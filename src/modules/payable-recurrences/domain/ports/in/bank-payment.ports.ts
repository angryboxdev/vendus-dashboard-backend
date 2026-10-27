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

/**
 * «Movimento recorrente» ligado a uma recorrência (conciliação automática de rendas e salários): escolhe a
 * ocorrência do mês a que o pagamento se refere (mês do movimento + `paymentPeriodOffset`), gerando-a se
 * ainda não existir, e deixa-a paga. Só esse mês — nunca outro: um segundo pagamento no mesmo mês (ex.:
 * adiantamento) não vai pagar o mês seguinte por engano; fica «Por conciliar» para decidir à mão.
 */
export interface SettleRecurrenceFromBankCommand {
  organizationId: OrganizationId;
  recurrenceId: string;
  movementId: string;
  /** Data do movimento (YYYY-MM-DD). */
  paidAt: string;
  bankAccountId: string | null;
}

/**
 * - `paid`: a ocorrência estava em aberto e ficou paga por este movimento.
 * - `linked`: já estava paga à mão e sem nenhum movimento — o movimento liga-se sem mexer no pagamento.
 * - `not_applicable`: recorrência inexistente/com fatura, mês fora do período, ocorrência cancelada, com
 *   fatura ou já paga por outro movimento → o movimento fica «Por conciliar».
 */
export type SettleRecurrenceFromBankResult =
  | { result: "paid" | "linked"; occurrenceId: string; period: string }
  | { result: "not_applicable"; reason: "not_found" | "invoice_required" | "no_occurrence" | "not_open" };

export interface SettleRecurrenceFromBankPort {
  execute(command: SettleRecurrenceFromBankCommand): Promise<SettleRecurrenceFromBankResult>;
}

/** Resumo de uma recorrência para validar uma regra que a liga («Movimentos recorrentes»). */
export interface RecurrenceForBankRuleDTO {
  id: string;
  name: string;
  status: "active" | "paused" | "closed";
  requireInvoice: boolean;
  paymentPeriodOffset: 0 | -1;
}

export interface GetRecurrenceForBankRulePort {
  execute(command: { organizationId: OrganizationId; recurrenceId: string }): Promise<RecurrenceForBankRuleDTO | null>;
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
