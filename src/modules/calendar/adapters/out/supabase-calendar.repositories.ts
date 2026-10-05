import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import {
  CompanyEvent,
  type EventCategory,
  type EventPriority,
  type EventStatus,
  type EventVisibility,
} from "../../domain/entities/company-event.js";
import { Holiday, type HolidayType } from "../../domain/entities/holiday.js";
import { DuplicateHolidayError } from "../../domain/errors.js";
import type {
  CalendarAuditLogEntry,
  CalendarAuditLogPort,
  CompanyEventRepositoryPort,
  HolidayRepositoryPort,
} from "../../domain/ports/out/calendar-repositories.port.js";

// ── Feriados (`hr_public_holidays`, tabela já existente — D6) ──────────────

interface HolidayRow {
  id: string;
  date: string;
  name: string;
  type: string;
  location_id: string | null;
}

function toHoliday(row: HolidayRow): Holiday {
  return Holiday.reconstitute({ id: row.id, date: row.date, name: row.name, type: row.type as HolidayType, locationId: row.location_id });
}

/** `is_national` acompanha sempre o tipo — o legacy (Férias) ainda o lê. */
function holidayRow(h: Holiday): Record<string, unknown> {
  return { date: h.date, name: h.name, type: h.type, location_id: h.locationId, is_national: h.type === "national", updated_at: new Date().toISOString() };
}

export class SupabaseHolidayRepository implements HolidayRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findInRange(organizationId: OrganizationId, from: string, to: string): Promise<Holiday[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_public_holidays")
      .select("id, date, name, type, location_id")
      .gte("date", from)
      .lte("date", to)
      .order("date");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as HolidayRow[]).map(toHoliday);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<Holiday | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_public_holidays")
      .select("id, date, name, type, location_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toHoliday(data as unknown as HolidayRow) : null;
  }

  async insert(organizationId: OrganizationId, holiday: Holiday): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("hr_public_holidays").insert({ id: holiday.id, ...holidayRow(holiday) });
    if (error?.code === "23505") throw new DuplicateHolidayError(holiday.date);
    if (error) throw new Error(error.message);
  }

  async update(organizationId: OrganizationId, holiday: Holiday): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("hr_public_holidays").update(holidayRow(holiday)).eq("id", holiday.id);
    if (error?.code === "23505") throw new DuplicateHolidayError(holiday.date);
    if (error) throw new Error(error.message);
  }

  async delete(organizationId: OrganizationId, id: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("hr_public_holidays").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}

// ── Eventos empresariais ──────────────────────────────────────────────────

const EVENT_SELECT =
  "id, title, date, all_day, start_time, end_time, description, category, location_id, priority, responsible, visibility, status, created_by, updated_at";

interface EventRow {
  id: string;
  title: string;
  date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  description: string | null;
  category: string;
  location_id: string | null;
  priority: string;
  responsible: string | null;
  visibility: string;
  status: string;
  created_by: string;
  updated_at: string;
}

/** Postgres devolve `time` como HH:MM:SS — o domínio usa HH:MM. */
function hhmm(value: string | null): string | null {
  return value ? value.slice(0, 5) : null;
}

function toEvent(row: EventRow): CompanyEvent {
  return CompanyEvent.reconstitute({
    id: row.id,
    title: row.title,
    date: row.date,
    allDay: row.all_day,
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    description: row.description,
    category: row.category as EventCategory,
    locationId: row.location_id,
    priority: row.priority as EventPriority,
    responsible: row.responsible,
    visibility: row.visibility as EventVisibility,
    status: row.status as EventStatus,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  });
}

function eventRow(e: CompanyEvent): Record<string, unknown> {
  const p = e.toProps();
  return {
    title: p.title,
    date: p.date,
    all_day: p.allDay,
    start_time: p.startTime,
    end_time: p.endTime,
    description: p.description,
    category: p.category,
    location_id: p.locationId,
    priority: p.priority,
    responsible: p.responsible,
    visibility: p.visibility,
    status: p.status,
    updated_at: p.updatedAt,
  };
}

export class SupabaseCompanyEventRepository implements CompanyEventRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findActiveInRange(organizationId: OrganizationId, from: string, to: string): Promise<CompanyEvent[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("company_events")
      .select(EVENT_SELECT)
      .eq("status", "active")
      .gte("date", from)
      .lte("date", to)
      .order("date");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as EventRow[]).map(toEvent);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<CompanyEvent | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("company_events").select(EVENT_SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEvent(data as unknown as EventRow) : null;
  }

  async insert(organizationId: OrganizationId, event: CompanyEvent): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("company_events")
      .insert({ id: event.id, created_by: event.toProps().createdBy, ...eventRow(event) });
    if (error) throw new Error(error.message);
  }

  async update(organizationId: OrganizationId, event: CompanyEvent): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("company_events").update(eventRow(event)).eq("id", event.id);
    if (error) throw new Error(error.message);
  }
}

// ── Auditoria (`calendar_audit_logs`, D3) ─────────────────────────────────

/** Fire-and-forget, como os restantes adapters de auditoria. */
export class SupabaseCalendarAuditLogAdapter implements CalendarAuditLogPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async record(entry: CalendarAuditLogEntry): Promise<void> {
    try {
      const { error } = await this.scopedQuery(entry.organizationId)
        .table("calendar_audit_logs")
        .insert({
          id: randomUUID(),
          entity_type: entry.entityType,
          entity_id: entry.entityId,
          action: entry.action,
          actor: entry.actor,
          payload_before: entry.before ?? null,
          payload_after: entry.after ?? null,
        });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error("[calendar-audit-log] falha ao gravar auditoria (ignorada):", e);
    }
  }
}
