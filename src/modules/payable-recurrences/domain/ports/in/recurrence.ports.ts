import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type {
  RecurrenceType,
  RecurrenceFrequency,
  RecurrenceStatus,
  PaymentMethod,
  PaymentPeriodOffset,
} from "../../entities/recurrence.js";
import type { RecurrenceFilter } from "../out/recurrence-repository.port.js";

// ── DTO ───────────────────────────────────────────────────────────────────────

export interface RecurrenceDTO {
  id: string;
  name: string;
  supplierId: string | null;
  supplierName: string;
  employeeId: string | null;
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
  closedAt: string | null; // YYYY-MM-DD
  pausedAt: string | null; // YYYY-MM-DD
  vatRate: number | null;
  vatIncluded: boolean | null;
  /** 0 = o pagamento refere-se ao próprio mês; -1 = ao mês anterior (salários). */
  paymentPeriodOffset: PaymentPeriodOffset;
  createdAt: string;
  updatedAt: string;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export interface CreateRecurrenceCommand {
  organizationId: OrganizationId;
  name: string;
  supplierId?: string | null;
  supplierName: string;
  /** Colaborador (recorrências de salários) — tem de existir na organização. */
  employeeId?: string | null;
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
  paymentPeriodOffset?: PaymentPeriodOffset;
}

export interface UpdateRecurrenceCommand {
  organizationId: OrganizationId;
  id: string;
  name?: string;
  supplierId?: string | null;
  supplierName?: string;
  employeeId?: string | null;
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
  vatRate?: number | null;
  vatIncluded?: boolean | null;
  paymentPeriodOffset?: PaymentPeriodOffset;
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
  /** Mandatory finalization date (YYYY-MM-DD) — spec Task_Recorrencias_Conciliacao_AngryBox.md §10. */
  closedAt: string;
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

// ── Colaboradores (recorrências de salários) ────────────────────────────────────

/** Só o necessário para escolher o colaborador no formulário (RGPD: sem outros dados da ficha). */
export interface RecurrenceEmployeeDTO {
  id: string;
  fullName: string;
  status: "active" | "inactive";
}

export interface ListRecurrenceEmployeesQuery {
  organizationId: OrganizationId;
}

export interface ListRecurrenceEmployeesPort {
  execute(query: ListRecurrenceEmployeesQuery): Promise<RecurrenceEmployeeDTO[]>;
}
