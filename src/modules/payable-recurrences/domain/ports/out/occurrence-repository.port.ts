import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { RecurrenceOccurrence, OccurrenceStatus } from "../../entities/recurrence-occurrence.js";

export interface OccurrenceFilter {
  recurrenceId?: string;
  period?: string;        // YYYY-MM
  status?: OccurrenceStatus;
  invoiceId?: string;
}

export interface OccurrenceRepositoryPort {
  save(organizationId: OrganizationId, occurrence: RecurrenceOccurrence): Promise<void>;
  update(organizationId: OrganizationId, occurrence: RecurrenceOccurrence): Promise<void>;
  delete(organizationId: OrganizationId, id: string): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<RecurrenceOccurrence | null>;
  findAll(organizationId: OrganizationId, filter?: OccurrenceFilter): Promise<RecurrenceOccurrence[]>;
  /** Returns null if no occurrence exists for that recurrence+period. */
  findByRecurrenceAndPeriod(
    organizationId: OrganizationId,
    recurrenceId: string,
    period: string,
  ): Promise<RecurrenceOccurrence | null>;
  /** Count occurrences grouped by status (across all recurrences). */
  countByStatus(organizationId: OrganizationId): Promise<Partial<Record<OccurrenceStatus, number>>>;
  /** Returns all invoice IDs currently linked to any occurrence. */
  findLinkedInvoiceIds(organizationId: OrganizationId): Promise<string[]>;
}
