import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PayableStatus, RecurrenceType } from "../../entities/payable-entry.js";
import type { PayableSummary, PayableCalendarDay } from "../../services/payable-summary.service.js";

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface PayableEntryDTO {
  id: string;
  invoiceId: string | null;
  supplierId: string | null;
  supplierName: string;
  description: string;
  costCenterId: string | null;
  category: string | null;
  amount: number;
  dueDate: string;       // YYYY-MM-DD
  paidAt: string | null; // YYYY-MM-DD
  recurrence: RecurrenceType;
  status: PayableStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayableSummaryDTO extends PayableSummary {}

export interface PayableCalendarDayDTO {
  date: string;
  entries: PayableEntryDTO[];
  totalAmount: number;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export interface CreatePayableEntryCommand {
  organizationId: OrganizationId;
  supplierId?: string | null;
  supplierName: string;
  description: string;
  costCenterId?: string | null;
  category?: string | null;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  recurrence?: RecurrenceType;
  notes?: string | null;
}


export interface UpdatePayableEntryCommand {
  organizationId: OrganizationId;
  id: string;
  supplierName?: string;
  description?: string;
  costCenterId?: string | null;
  category?: string | null;
  amount?: number;
  dueDate?: string; // YYYY-MM-DD
  recurrence?: RecurrenceType;
  notes?: string | null;
}

export interface MarkPayableAsPaidCommand {
  organizationId: OrganizationId;
  id: string;
  paidAt?: string; // YYYY-MM-DD — defaults to today
}

export interface CancelPayableEntryCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface ListPayableEntriesFilter {
  organizationId: OrganizationId;
  supplierId?: string;
  costCenterId?: string;
  status?: PayableStatus;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}

export interface GetPayableEntryQuery {
  organizationId: OrganizationId;
  id: string;
}

export interface DeletePayableEntryCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface GetPayableCalendarCommand {
  organizationId: OrganizationId;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

// ── Input ports ───────────────────────────────────────────────────────────────

export interface CreatePayableEntryPort {
  execute(command: CreatePayableEntryCommand): Promise<PayableEntryDTO>;
}


export interface UpdatePayableEntryPort {
  execute(command: UpdatePayableEntryCommand): Promise<PayableEntryDTO>;
}

export interface MarkPayableAsPaidPort {
  execute(command: MarkPayableAsPaidCommand): Promise<PayableEntryDTO>;
}

export interface CancelPayableEntryPort {
  execute(command: CancelPayableEntryCommand): Promise<PayableEntryDTO>;
}

export interface ListPayableEntriesPort {
  execute(filter: ListPayableEntriesFilter): Promise<PayableEntryDTO[]>;
}

export interface GetPayableEntryPort {
  execute(query: GetPayableEntryQuery): Promise<PayableEntryDTO>;
}

export interface DeletePayableEntryPort {
  execute(command: DeletePayableEntryCommand): Promise<void>;
}

export interface GetPayableSummaryPort {
  execute(filter: ListPayableEntriesFilter): Promise<PayableSummaryDTO>;
}

export interface GetPayableCalendarPort {
  execute(command: GetPayableCalendarCommand): Promise<PayableCalendarDayDTO[]>;
}
