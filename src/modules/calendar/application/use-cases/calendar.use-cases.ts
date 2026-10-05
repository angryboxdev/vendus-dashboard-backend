import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { CompanyEvent, type CompanyEventProps } from "../../domain/entities/company-event.js";
import { Holiday, holidayKey, isIsoDate, type HolidayProps } from "../../domain/entities/holiday.js";
import {
  CompanyEventNotFoundError,
  DuplicateHolidayError,
  HolidayNotFoundError,
  InvalidCalendarEntryError,
  InvalidCalendarLocationError,
} from "../../domain/errors.js";
import type {
  CancelCompanyEventCommand,
  CancelCompanyEventPort,
  CreateCompanyEventCommand,
  CreateCompanyEventPort,
  CreateHolidayCommand,
  CreateHolidayPort,
  DeleteHolidayCommand,
  DeleteHolidayPort,
  HolidayImportRow,
  ImportHolidaysCommand,
  ImportHolidaysPort,
  ListCalendarPort,
  ListCalendarQuery,
  ListUpcomingImportantPort,
  PreviewHolidayImportPort,
  PreviewHolidayImportQuery,
  UpcomingImportantQuery,
  UpdateCompanyEventCommand,
  UpdateCompanyEventPort,
  UpdateHolidayCommand,
  UpdateHolidayPort,
} from "../../domain/ports/in/calendar.ports.js";
import type {
  CalendarAuditLogPort,
  CalendarLocationReadPort,
  CompanyEventRepositoryPort,
  DocumentDeadlineReadPort,
  HolidayRepositoryPort,
} from "../../domain/ports/out/calendar-repositories.port.js";
import {
  deadlineToItem,
  eventToItem,
  filterCalendarItems,
  holidayToItem,
  upcomingImportant,
  type CalendarItem,
  type CalendarViewerRole,
} from "../../domain/services/calendar-items.service.js";
import { portugueseNationalHolidays } from "../../domain/services/portuguese-holidays.service.js";

type Clock = () => Date;
const systemClock: Clock = () => new Date();
const MAX_RANGE_DAYS = 400;

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function assertRange(from: string, to: string): void {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) throw new InvalidCalendarEntryError("Intervalo de datas inválido");
  if (to > addDays(from, MAX_RANGE_DAYS)) throw new InvalidCalendarEntryError("Intervalo demasiado grande (máximo ~1 ano)");
}

/** Um Local tem de existir; inativo só é aceite se já era o Local deste registo. */
async function assertLocation(
  locations: CalendarLocationReadPort,
  organizationId: OrganizationId,
  locationId: string | null,
  currentLocationId: string | null,
): Promise<void> {
  if (locationId === null) return;
  const location = (await locations.findAll(organizationId)).find((l) => l.id === locationId);
  if (!location) throw new InvalidCalendarLocationError("Local não encontrado");
  if (!location.isActive && location.id !== currentLocationId) throw new InvalidCalendarLocationError("O local está inativo");
}

/** Feriados + eventos + prazos (ticket 05) do intervalo, já com visibilidade aplicada. */
async function collectItems(
  holidays: HolidayRepositoryPort,
  events: CompanyEventRepositoryPort,
  deadlines: DocumentDeadlineReadPort,
  organizationId: OrganizationId,
  viewerRole: CalendarViewerRole,
  from: string,
  to: string,
  today: string,
): Promise<CalendarItem[]> {
  const [hs, es, ds] = await Promise.all([
    holidays.findInRange(organizationId, from, to),
    events.findActiveInRange(organizationId, from, to),
    // Prazos de documentos da Empresa só para a gestão (D11).
    viewerRole === "hr_viewer" ? Promise.resolve([]) : deadlines.findInRange(organizationId, from, to, viewerRole),
  ]);
  return [...hs.map(holidayToItem), ...es.map(eventToItem), ...ds.map((d) => deadlineToItem(d, today))];
}

export class ListCalendarUseCase implements ListCalendarPort {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly events: CompanyEventRepositoryPort,
    private readonly deadlines: DocumentDeadlineReadPort,
    private readonly now: Clock = systemClock,
  ) {}

  async execute(query: ListCalendarQuery): Promise<CalendarItem[]> {
    assertRange(query.from, query.to);
    const today = this.now().toISOString().slice(0, 10);
    const items = await collectItems(this.holidays, this.events, this.deadlines, query.organizationId, query.viewerRole, query.from, query.to, today);
    return filterCalendarItems(items, query.filter, query.viewerRole);
  }
}

export class ListUpcomingImportantUseCase implements ListUpcomingImportantPort {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly events: CompanyEventRepositoryPort,
    private readonly deadlines: DocumentDeadlineReadPort,
  ) {}

  async execute(query: UpcomingImportantQuery): Promise<CalendarItem[]> {
    const to = addDays(query.today, query.days ?? 60);
    const items = await collectItems(this.holidays, this.events, this.deadlines, query.organizationId, query.viewerRole, query.today, to, query.today);
    return upcomingImportant(filterCalendarItems(items, {}, query.viewerRole), query.today, query.limit ?? 10);
  }
}

export class CreateHolidayUseCase implements CreateHolidayPort {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly locations: CalendarLocationReadPort,
    private readonly auditLog: CalendarAuditLogPort,
    private readonly newId: () => string = randomUUID,
  ) {}

  async execute(command: CreateHolidayCommand): Promise<HolidayProps> {
    const holiday = Holiday.create(this.newId(), command.details);
    await assertLocation(this.locations, command.organizationId, holiday.locationId, null);
    const sameDay = await this.holidays.findInRange(command.organizationId, holiday.date, holiday.date);
    if (sameDay.some((h) => h.key === holiday.key)) throw new DuplicateHolidayError(holiday.date);
    await this.holidays.insert(command.organizationId, holiday);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "holiday",
      entityId: holiday.id,
      action: "create",
      after: holiday.toProps(),
    });
    return holiday.toProps();
  }
}

export class UpdateHolidayUseCase implements UpdateHolidayPort {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly locations: CalendarLocationReadPort,
    private readonly auditLog: CalendarAuditLogPort,
  ) {}

  async execute(command: UpdateHolidayCommand): Promise<HolidayProps> {
    const current = await this.holidays.findById(command.organizationId, command.id);
    if (!current) throw new HolidayNotFoundError(command.id);
    const updated = current.update(command.changes);
    await assertLocation(this.locations, command.organizationId, updated.locationId, current.locationId);
    const sameDay = await this.holidays.findInRange(command.organizationId, updated.date, updated.date);
    if (sameDay.some((h) => h.id !== updated.id && h.key === updated.key)) throw new DuplicateHolidayError(updated.date);
    await this.holidays.update(command.organizationId, updated);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "holiday",
      entityId: updated.id,
      action: "update",
      before: current.toProps(),
      after: updated.toProps(),
    });
    return updated.toProps();
  }
}

export class DeleteHolidayUseCase implements DeleteHolidayPort {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly auditLog: CalendarAuditLogPort,
  ) {}

  async execute(command: DeleteHolidayCommand): Promise<void> {
    const current = await this.holidays.findById(command.organizationId, command.id);
    if (!current) throw new HolidayNotFoundError(command.id);
    // Auditado antes de remover — o registo completo fica no histórico.
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "holiday",
      entityId: current.id,
      action: "delete",
      before: current.toProps(),
    });
    await this.holidays.delete(command.organizationId, command.id);
  }
}

async function importRows(holidays: HolidayRepositoryPort, query: PreviewHolidayImportQuery): Promise<HolidayImportRow[]> {
  if (!Number.isInteger(query.year) || query.year < 2000 || query.year > 2100) throw new InvalidCalendarEntryError("Ano inválido");
  const existing = await holidays.findInRange(query.organizationId, `${query.year}-01-01`, `${query.year}-12-31`);
  const keys = new Set(existing.map((h) => h.key));
  return portugueseNationalHolidays(query.year).map((h) => ({
    ...h,
    status: keys.has(holidayKey({ date: h.date, type: "national", locationId: null })) ? "existing" : "new",
  }));
}

export class PreviewHolidayImportUseCase implements PreviewHolidayImportPort {
  constructor(private readonly holidays: HolidayRepositoryPort) {}

  execute(query: PreviewHolidayImportQuery): Promise<HolidayImportRow[]> {
    return importRows(this.holidays, query);
  }
}

export class ImportHolidaysUseCase implements ImportHolidaysPort {
  constructor(
    private readonly holidays: HolidayRepositoryPort,
    private readonly auditLog: CalendarAuditLogPort,
    private readonly newId: () => string = randomUUID,
  ) {}

  async execute(command: ImportHolidaysCommand): Promise<{ created: number; skipped: number }> {
    const rows = await importRows(this.holidays, command);
    let created = 0;
    for (const row of rows.filter((r) => r.status === "new")) {
      const holiday = Holiday.create(this.newId(), { date: row.date, name: row.name, type: "national", locationId: null });
      try {
        await this.holidays.insert(command.organizationId, holiday);
        created += 1;
        await this.auditLog.record({
          organizationId: command.organizationId,
          actor: command.actor,
          entityType: "holiday",
          entityId: holiday.id,
          action: "import",
          after: holiday.toProps(),
        });
      } catch (e) {
        // Importação concorrente: a BD já o tem — conta como existente, nunca duplica.
        if (!(e instanceof DuplicateHolidayError)) throw e;
      }
    }
    return { created, skipped: rows.length - created };
  }
}

export class CreateCompanyEventUseCase implements CreateCompanyEventPort {
  constructor(
    private readonly events: CompanyEventRepositoryPort,
    private readonly locations: CalendarLocationReadPort,
    private readonly auditLog: CalendarAuditLogPort,
    private readonly now: Clock = systemClock,
    private readonly newId: () => string = randomUUID,
  ) {}

  async execute(command: CreateCompanyEventCommand): Promise<CompanyEventProps> {
    const event = CompanyEvent.create(this.newId(), command.details, command.actor, this.now());
    await assertLocation(this.locations, command.organizationId, event.locationId, null);
    await this.events.insert(command.organizationId, event);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "company_event",
      entityId: event.id,
      action: "create",
      after: event.toProps(),
    });
    return event.toProps();
  }
}

export class UpdateCompanyEventUseCase implements UpdateCompanyEventPort {
  constructor(
    private readonly events: CompanyEventRepositoryPort,
    private readonly locations: CalendarLocationReadPort,
    private readonly auditLog: CalendarAuditLogPort,
    private readonly now: Clock = systemClock,
  ) {}

  async execute(command: UpdateCompanyEventCommand): Promise<CompanyEventProps> {
    const current = await this.events.findById(command.organizationId, command.id);
    if (!current) throw new CompanyEventNotFoundError(command.id);
    const updated = current.update(command.changes, this.now());
    await assertLocation(this.locations, command.organizationId, updated.locationId, current.locationId);
    await this.events.update(command.organizationId, updated);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "company_event",
      entityId: updated.id,
      action: "update",
      before: current.toProps(),
      after: updated.toProps(),
    });
    return updated.toProps();
  }
}

export class CancelCompanyEventUseCase implements CancelCompanyEventPort {
  constructor(
    private readonly events: CompanyEventRepositoryPort,
    private readonly auditLog: CalendarAuditLogPort,
    private readonly now: Clock = systemClock,
  ) {}

  async execute(command: CancelCompanyEventCommand): Promise<CompanyEventProps> {
    const current = await this.events.findById(command.organizationId, command.id);
    if (!current) throw new CompanyEventNotFoundError(command.id);
    if (current.status === "cancelled") return current.toProps();
    const cancelled = current.cancel(this.now());
    await this.events.update(command.organizationId, cancelled);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "company_event",
      entityId: cancelled.id,
      action: "cancel",
      before: current.toProps(),
      after: cancelled.toProps(),
    });
    return cancelled.toProps();
  }
}
