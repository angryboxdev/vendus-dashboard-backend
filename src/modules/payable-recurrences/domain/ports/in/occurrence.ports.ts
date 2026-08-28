import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { OccurrenceStatus, OccurrencePaymentMethod } from "../../entities/recurrence-occurrence.js";
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
  /** Bank movement that justified this occurrence, if any. */
  linkedBankMovement: LinkedBankMovement | null;
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
