import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CompanyEventDetails, CompanyEventProps } from "../../entities/company-event.js";
import type { HolidayDetails, HolidayProps } from "../../entities/holiday.js";
import type { CalendarFilter, CalendarItem, CalendarViewerRole } from "../../services/calendar-items.service.js";
import type { HolidayCountry } from "../../services/portuguese-holidays.service.js";

// ── Leitura ───────────────────────────────────────────────────────────────

export interface ListCalendarQuery {
  organizationId: OrganizationId;
  viewerRole: CalendarViewerRole;
  /** AAAA-MM-DD, inclusivo; no máximo ~1 ano de intervalo. */
  from: string;
  to: string;
  filter: CalendarFilter;
}

export interface ListCalendarPort {
  execute(query: ListCalendarQuery): Promise<CalendarItem[]>;
}

export interface UpcomingImportantQuery {
  organizationId: OrganizationId;
  viewerRole: CalendarViewerRole;
  today: string;
  /** Janela em dias (por defeito 60). */
  days?: number;
  limit?: number;
}

/** Bloco "Próximos eventos importantes" (task §8). */
export interface ListUpcomingImportantPort {
  execute(query: UpcomingImportantQuery): Promise<CalendarItem[]>;
}

// ── Feriados ──────────────────────────────────────────────────────────────

interface WriteCommand {
  organizationId: OrganizationId;
  actor: string;
}

export interface CreateHolidayCommand extends WriteCommand {
  details: HolidayDetails;
}
export interface CreateHolidayPort {
  execute(command: CreateHolidayCommand): Promise<HolidayProps>;
}

export interface UpdateHolidayCommand extends WriteCommand {
  id: string;
  changes: Partial<HolidayDetails>;
}
export interface UpdateHolidayPort {
  execute(command: UpdateHolidayCommand): Promise<HolidayProps>;
}

/** Remover um feriado criado por engano — auditado com o registo completo (nunca silencioso). */
export interface DeleteHolidayCommand extends WriteCommand {
  id: string;
}
export interface DeleteHolidayPort {
  execute(command: DeleteHolidayCommand): Promise<void>;
}

export interface HolidayImportRow {
  date: string;
  name: string;
  /** `existing` = já há um feriado nacional da empresa nesse dia — nunca é duplicado. */
  status: "new" | "existing";
}

export interface PreviewHolidayImportQuery {
  organizationId: OrganizationId;
  country: HolidayCountry;
  year: number;
}
/** Pré-visualização antes de gravar (task §6). */
export interface PreviewHolidayImportPort {
  execute(query: PreviewHolidayImportQuery): Promise<HolidayImportRow[]>;
}

export interface ImportHolidaysCommand extends WriteCommand {
  country: HolidayCountry;
  year: number;
}
/** Importa só os que faltam — importar duas vezes nunca duplica. */
export interface ImportHolidaysPort {
  execute(command: ImportHolidaysCommand): Promise<{ created: number; skipped: number }>;
}

// ── Eventos ───────────────────────────────────────────────────────────────

export interface CreateCompanyEventCommand extends WriteCommand {
  details: CompanyEventDetails;
}
export interface CreateCompanyEventPort {
  execute(command: CreateCompanyEventCommand): Promise<CompanyEventProps>;
}

export interface UpdateCompanyEventCommand extends WriteCommand {
  id: string;
  changes: Partial<CompanyEventDetails>;
}
export interface UpdateCompanyEventPort {
  execute(command: UpdateCompanyEventCommand): Promise<CompanyEventProps>;
}

export interface CancelCompanyEventCommand extends WriteCommand {
  id: string;
}
/** Cancelar, nunca apagar. */
export interface CancelCompanyEventPort {
  execute(command: CancelCompanyEventCommand): Promise<CompanyEventProps>;
}
