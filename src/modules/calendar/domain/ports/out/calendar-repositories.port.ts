import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CompanyEvent } from "../../entities/company-event.js";
import type { Holiday } from "../../entities/holiday.js";
import type { CalendarViewerRole, DocumentDeadline } from "../../services/calendar-items.service.js";

/** `hr_public_holidays` — a tabela de feriados já existente (D6). */
export interface HolidayRepositoryPort {
  findInRange(organizationId: OrganizationId, from: string, to: string): Promise<Holiday[]>;
  findById(organizationId: OrganizationId, id: string): Promise<Holiday | null>;
  /** Lança `DuplicateHolidayError` se a chave data+tipo+âmbito já existir. */
  insert(organizationId: OrganizationId, holiday: Holiday): Promise<void>;
  update(organizationId: OrganizationId, holiday: Holiday): Promise<void>;
  delete(organizationId: OrganizationId, id: string): Promise<void>;
}

export interface CompanyEventRepositoryPort {
  /** Só eventos ativos (cancelados nunca aparecem no calendário). */
  findActiveInRange(organizationId: OrganizationId, from: string, to: string): Promise<CompanyEvent[]>;
  findById(organizationId: OrganizationId, id: string): Promise<CompanyEvent | null>;
  insert(organizationId: OrganizationId, event: CompanyEvent): Promise<void>;
  update(organizationId: OrganizationId, event: CompanyEvent): Promise<void>;
}

/**
 * Prazos dos documentos da Empresa com validade (ticket 05) — lidos sempre a
 * partir das versões atuais, por isso nunca duplicam e acompanham qualquer
 * alteração/substituição do documento. Respeita a visibilidade do documento
 * para o papel de quem consulta (D11).
 */
export interface DocumentDeadlineReadPort {
  findInRange(organizationId: OrganizationId, from: string, to: string, viewerRole: CalendarViewerRole): Promise<DocumentDeadline[]>;
}

/** Locais da organização — validar o Local de um feriado/evento. */
export interface CalendarLocationReadPort {
  findAll(organizationId: OrganizationId): Promise<Array<{ id: string; isActive: boolean }>>;
}

export type CalendarAuditEntityType = "holiday" | "company_event";

export interface CalendarAuditLogEntry {
  organizationId: OrganizationId;
  actor: string;
  entityType: CalendarAuditEntityType;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

/** D3 — `calendar_audit_logs`; fire-and-forget. */
export interface CalendarAuditLogPort {
  record(entry: CalendarAuditLogEntry): Promise<void>;
}
