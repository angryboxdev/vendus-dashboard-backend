import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { OccurrenceStatus, OccurrenceDisplayState, OccurrencePaymentMethod } from "../../entities/recurrence-occurrence.js";
import type { OccurrenceFilter } from "../out/occurrence-repository.port.js";
import type { LinkedBankMovement } from "../out/bank-movement-link-read.port.js";

// ── DTO ───────────────────────────────────────────────────────────────────────

export interface OccurrenceDTO {
  id: string;
  recurrenceId: string;
  period: string;                 // YYYY-MM
  estimatedAmountCents: number;
  realAmountCents: number | null;
  effectiveAmountCents: number;
  dueDate: string;                // YYYY-MM-DD
  status: OccurrenceStatus;
  requireInvoice: boolean;
  invoiceId: string | null;
  paidAt: string | null;          // ISO string
  paymentMethod: OccurrencePaymentMethod | null;
  paymentBankAccountId: string | null;
  paymentNotes: string | null;
  notes: string | null;
  documentUrl: string | null;
  /** Bank movement(s) that justified this occurrence (fluxo B — sem fatura). Can have more than one (pagamentos parciais). Empty when linked via invoice instead (fluxo A) or not yet reconciled. */
  linkedBankMovements: LinkedBankMovement[];
  /** Soma de movimentos bancários (fluxo B) ou do valor já alocado à fatura vinculada (fluxo A). Calculado ao vivo — nunca persistido. */
  paidAmountCents: number;
  /** paidAmountCents - effectiveAmountCents. Nunca deve ser lido como "dívida" automaticamente (spec §11) — apenas informativo. */
  differenceCents: number;
  /** Calculado ao vivo a partir de status + paidAmountCents + dueDate (ver computeOccurrenceDisplayState). */
  displayState: OccurrenceDisplayState;
  createdAt: string;
  updatedAt: string;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export interface GenerateOccurrenceCommand {
  organizationId: OrganizationId;
  recurrenceId: string;
  year: number;
  month: number; // 1-based
}

export interface LinkInvoiceCommand {
  organizationId: OrganizationId;
  occurrenceId: string;
  invoiceId: string;
}

export interface MarkOccurrenceAsPaidCommand {
  organizationId: OrganizationId;
  occurrenceId: string;
  paidAt?: string;                         // YYYY-MM-DD, defaults to today
  paymentMethod?: OccurrencePaymentMethod;
  paymentBankAccountId?: string;
  paymentNotes?: string;
}

export interface CancelOccurrenceCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface ListOccurrencesQuery extends OccurrenceFilter {
  organizationId: OrganizationId;
}

export interface GetOccurrenceQuery {
  organizationId: OrganizationId;
  id: string;
}

export interface GetLinkedInvoiceIdsQuery {
  organizationId: OrganizationId;
}

// ── Input ports ───────────────────────────────────────────────────────────────

export interface GenerateOccurrencePort {
  execute(command: GenerateOccurrenceCommand): Promise<OccurrenceDTO>;
}

export interface ListOccurrencesPort {
  execute(query: ListOccurrencesQuery): Promise<OccurrenceDTO[]>;
}

export interface GetOccurrencePort {
  execute(query: GetOccurrenceQuery): Promise<OccurrenceDTO>;
}

export interface LinkInvoiceToOccurrencePort {
  execute(command: LinkInvoiceCommand): Promise<OccurrenceDTO>;
}

export interface MarkOccurrenceAsPaidPort {
  execute(command: MarkOccurrenceAsPaidCommand): Promise<OccurrenceDTO>;
}

export interface CancelOccurrencePort {
  execute(command: CancelOccurrenceCommand): Promise<void>;
}

export interface GetLinkedInvoiceIdsPort {
  execute(query: GetLinkedInvoiceIdsQuery): Promise<string[]>;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface RecurrenceSummaryDTO {
  awaitingInvoiceCount: number;
}

export interface GetRecurrenceSummaryQuery {
  organizationId: OrganizationId;
}

export interface GetRecurrenceSummaryPort {
  execute(query: GetRecurrenceSummaryQuery): Promise<RecurrenceSummaryDTO>;
}

// ── Monthly summary (cross-recurrence) ───────────────────────────────────────

/**
 * Aggregate KPIs across ALL recurrences for a given month (spec
 * Task_Recorrencias_Conciliacao_AngryBox.md §1/§6/§12). Everything here is
 * computed live from occurrences + active recurrences — nothing is persisted.
 */
export interface RecurrenceMonthlySummaryDTO {
  period: string; // YYYY-MM
  activeRecurrencesCount: number;
  /** Soma do valor efetivo (real quando há fatura, estimado caso contrário) de todas as ocorrências do mês — incluindo recorrências ativas ainda sem ocorrência gerada. */
  forecastedAmountCents: number;
  /** Soma do que já foi efetivamente pago no mês. */
  paidAmountCents: number;
  /** Ainda por pagar, mas dentro do prazo (dueDate >= hoje). */
  pendingCount: number;
  pendingAmountCents: number;
  /** Ainda por pagar, e o prazo já passou (dueDate < hoje). */
  overdueCount: number;
  overdueAmountCents: number;
  /** (Pago - Previsto) / Previsto * 100. Só preenchido quando não há nada pendente/vencido — enquanto houver, a comparação não faz sentido. */
  paidVsForecastedPercent: number | null;
}

export interface GetMonthlySummaryQuery {
  organizationId: OrganizationId;
  period: string; // YYYY-MM
}

export interface GetMonthlySummaryPort {
  execute(query: GetMonthlySummaryQuery): Promise<RecurrenceMonthlySummaryDTO>;
}

export interface ListOccurrencesForPeriodQuery {
  organizationId: OrganizationId;
  period: string; // YYYY-MM
}

/** Cross-recurrence occurrence listing for a period (vista mensal) — garante primeiro que as ocorrências existem (ver ensureOccurrencesForPeriod). */
export interface ListOccurrencesForPeriodPort {
  execute(query: ListOccurrencesForPeriodQuery): Promise<OccurrenceDTO[]>;
}
