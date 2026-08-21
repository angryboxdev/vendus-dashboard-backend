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
  recurrenceId: string;
  year: number;
  month: number; // 1-based
}

export interface LinkInvoiceCommand {
  occurrenceId: string;
  invoiceId: string;
}

export interface MarkOccurrenceAsPaidCommand {
  occurrenceId: string;
  paidAt?: string;                         // YYYY-MM-DD, defaults to today
  paymentMethod?: OccurrencePaymentMethod;
  paymentBankAccountId?: string;
  paymentNotes?: string;
}

// ── Input ports ───────────────────────────────────────────────────────────────

export interface GenerateOccurrencePort {
  execute(command: GenerateOccurrenceCommand): Promise<OccurrenceDTO>;
}

export interface ListOccurrencesPort {
  execute(filter?: OccurrenceFilter): Promise<OccurrenceDTO[]>;
}

export interface GetOccurrencePort {
  execute(id: string): Promise<OccurrenceDTO>;
}

export interface LinkInvoiceToOccurrencePort {
  execute(command: LinkInvoiceCommand): Promise<OccurrenceDTO>;
}

export interface MarkOccurrenceAsPaidPort {
  execute(command: MarkOccurrenceAsPaidCommand): Promise<OccurrenceDTO>;
}

export interface CancelOccurrencePort {
  execute(id: string): Promise<void>;
}

export interface GetLinkedInvoiceIdsPort {
  execute(): Promise<string[]>;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface RecurrenceSummaryDTO {
  awaitingInvoiceCount: number;
}

export interface GetRecurrenceSummaryPort {
  execute(): Promise<RecurrenceSummaryDTO>;
}
