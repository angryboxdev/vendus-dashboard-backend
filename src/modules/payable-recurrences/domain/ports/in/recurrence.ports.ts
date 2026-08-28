import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type {
  RecurrenceType,
  RecurrenceFrequency,
  RecurrenceStatus,
  PaymentMethod,
} from "../../entities/recurrence.js";
import type { RecurrenceFilter } from "../out/recurrence-repository.port.js";

// ── DTO ───────────────────────────────────────────────────────────────────────

export interface RecurrenceDTO {
  id: string;
  name: string;
  supplierId: string | null;
  supplierName: string;
  type: RecurrenceType;
  frequency: RecurrenceFrequency;
  costCenterId: string | null;
  costCenterCategoryId: string | null;
  category: string | null;
  estimatedAmountCents: number;
  dayOfMonth: number;
  startDate: string;      // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  autoCreatePayable: boolean;
  requireInvoice: boolean;
  status: RecurrenceStatus;
  notes: string | null;
  documentUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export interface CreateRecurrenceCommand {
  organizationId: OrganizationId;
  name: string;
  supplierId?: string | null;
  supplierName: string;
  type: RecurrenceType;
  frequency?: RecurrenceFrequency;
  costCenterId?: string | null;
  costCenterCategoryId?: string | null;
  category?: string | null;
  estimatedAmountCents: number;
  dayOfMonth: number;
  startDate: string;       // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  autoCreatePayable?: boolean;
  requireInvoice?: boolean;
  notes?: string | null;
}

export interface UpdateRecurrenceCommand {
  organizationId: OrganizationId;
  id: string;
  name?: string;
  supplierId?: string | null;
  supplierName?: string;
  costCenterId?: string | null;
  costCenterCategoryId?: string | null;
  category?: string | null;
  estimatedAmountCents?: number;
  dayOfMonth?: number;
  endDate?: string | null; // YYYY-MM-DD
  paymentMethod?: PaymentMethod;
  autoCreatePayable?: boolean;
  requireInvoice?: boolean;
  notes?: string | null;
}

export interface PauseRecurrenceCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface ResumeRecurrenceCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface CloseRecurrenceCommand {
  organizationId: OrganizationId;
  id: string;
}

export interface ListRecurrencesQuery extends RecurrenceFilter {
  organizationId: OrganizationId;
}

export interface GetRecurrenceQuery {
  organizationId: OrganizationId;
  id: string;
}

// ── Input ports ───────────────────────────────────────────────────────────────

export interface CreateRecurrencePort {
  execute(command: CreateRecurrenceCommand): Promise<RecurrenceDTO>;
}

export interface UpdateRecurrencePort {
  execute(command: UpdateRecurrenceCommand): Promise<RecurrenceDTO>;
}

export interface PauseRecurrencePort {
  execute(command: PauseRecurrenceCommand): Promise<RecurrenceDTO>;
}

export interface ResumeRecurrencePort {
  execute(command: ResumeRecurrenceCommand): Promise<RecurrenceDTO>;
}

export interface CloseRecurrencePort {
  execute(command: CloseRecurrenceCommand): Promise<RecurrenceDTO>;
}

export interface ListRecurrencesPort {
  execute(query: ListRecurrencesQuery): Promise<RecurrenceDTO[]>;
}

export interface GetRecurrencePort {
  execute(query: GetRecurrenceQuery): Promise<RecurrenceDTO>;
}
