import type { RecurrenceOccurrence, OccurrenceStatus } from "../../entities/recurrence-occurrence.js";

export interface OccurrenceFilter {
  recurrenceId?: string;
  period?: string;        // YYYY-MM
  status?: OccurrenceStatus;
  invoiceId?: string;
}

export interface OccurrenceRepositoryPort {
  save(occurrence: RecurrenceOccurrence): Promise<void>;
  update(occurrence: RecurrenceOccurrence): Promise<void>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<RecurrenceOccurrence | null>;
  findAll(filter?: OccurrenceFilter): Promise<RecurrenceOccurrence[]>;
  /** Returns null if no occurrence exists for that recurrence+period. */
  findByRecurrenceAndPeriod(recurrenceId: string, period: string): Promise<RecurrenceOccurrence | null>;
  /** Count occurrences grouped by status (across all recurrences). */
  countByStatus(): Promise<Partial<Record<OccurrenceStatus, number>>>;
  /** Returns all invoice IDs currently linked to any occurrence. */
  findLinkedInvoiceIds(): Promise<string[]>;
}
