import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  activeOn,
  assignmentOverlaps,
  resolveAssignment,
  validateHolidayCalendar,
  validateHolidayDay,
  validateVacationCalendar,
  type HolidayCalendar,
  type HolidayDay,
  type ResourceType,
  type TargetType,
  type TimeAssignment,
  type VacationCalendar,
} from "../../domain/entities/calendars.js";
import { validateVersion, versionOn, versionOverlaps, type ScheduleKind, type ScheduleVersion } from "../../domain/entities/schedule.js";
import { TimeConflictError, TimeNotFoundError, TimeValidationError } from "../../domain/errors.js";
import type {
  EmployeeTimeContextPort,
  NationalHolidaysPort,
  TimeAuditPort,
  TimeBaseRepositoryPort,
  TimeClockPort,
  TimeImpactPort,
} from "../../domain/ports/out/time-base.ports.js";
import { eachDate, theoreticalDay, type TheoreticalDay } from "../../domain/services/theoretical.service.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const lower = (s: string) => s.toLocaleLowerCase("pt");
const MAX_RANGE_DAYS = 62;

export interface DeletePreview {
  name: string;
  days: number;
  employees: number;
  assignments: number;
}

export class TimeBaseUseCases {
  constructor(
    private readonly repo: TimeBaseRepositoryPort,
    private readonly context: EmployeeTimeContextPort,
    private readonly impact: TimeImpactPort,
    private readonly national: NationalHolidaysPort,
    private readonly audit: TimeAuditPort,
    private readonly clock: TimeClockPort,
  ) {}

  private log(org: OrganizationId, actor: string, action: string, resourceType: string, resourceId: string | null, before: unknown, after: unknown, reason: string | null = null) {
    return this.audit.record(org, { actor, action, resourceType, resourceId, before, after, reason });
  }

  // ── Horários ────────────────────────────────────────────────────────
  async listSchedules(org: OrganizationId) {
    const [schedules, versions] = await Promise.all([this.repo.listSchedules(org), this.repo.listVersions(org)]);
    return schedules.map((s) => ({ ...s, versions: versions.filter((v) => v.scheduleId === s.id).sort((a, b) => a.validFrom.localeCompare(b.validFrom)) }));
  }

  /** CF-13: nomes únicos por organização (sem distinguir maiúsculas). */
  async createSchedule(org: OrganizationId, actor: string, input: { name: string; kind: ScheduleKind; firstVersion: Omit<ScheduleVersion, "id" | "scheduleId"> }) {
    const name = input.name.trim();
    if (!name || name.length > 120) throw new TimeValidationError("O nome é obrigatório (máx. 120).", "name");
    if (input.kind !== "fixed" && input.kind !== "flexible") throw new TimeValidationError("Tipo de horário inválido.", "kind");
    validateVersion(input.kind, input.firstVersion);
    if ((await this.repo.listSchedules(org)).some((s) => !s.archived && lower(s.name) === lower(name))) {
      throw new TimeConflictError("Já existe um horário com este nome.", "duplicate_name", { field: "name" });
    }
    const schedule = await this.repo.createSchedule(org, { name, kind: input.kind }, actor);
    const version = await this.repo.createVersion(org, { ...input.firstVersion, scheduleId: schedule.id }, actor);
    await this.log(org, actor, "time.schedule.create", "work_schedule", schedule.id, null, { schedule, version });
    return { ...schedule, versions: [version] };
  }

  /** Nova versão (ex.: mudança a meio do mês). A versão aberta anterior termina na véspera. */
  async addVersion(org: OrganizationId, actor: string, scheduleId: string, input: Omit<ScheduleVersion, "id" | "scheduleId">) {
    const schedule = (await this.repo.listSchedules(org)).find((s) => s.id === scheduleId && !s.archived);
    if (!schedule) throw new TimeNotFoundError("Horário não encontrado.");
    validateVersion(schedule.kind, input);
    const versions = (await this.repo.listVersions(org)).filter((v) => v.scheduleId === scheduleId);
    // A versão aberta que começou antes passa a terminar na véspera (mudança a meio do mês).
    const open = versions.find((v) => v.validTo === null && v.validFrom < input.validFrom);
    const clash = versionOverlaps(versions.filter((v) => v !== open), input);
    if (clash) throw new TimeConflictError(`Sobrepõe-se à versão que começa a ${clash.validFrom}.`, "version_overlap");
    if (open) {
      const dayBefore = new Date(Date.parse(`${input.validFrom}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      await this.repo.endVersion(org, open.id, dayBefore);
    }
    const v = await this.repo.createVersion(org, { ...input, scheduleId }, actor);
    await this.log(org, actor, "time.schedule.version", "work_schedule", scheduleId, null, v);
    return v;
  }

  async archiveSchedule(org: OrganizationId, actor: string, id: string) {
    await this.repo.archiveSchedule(org, id);
    await this.log(org, actor, "time.schedule.archive", "work_schedule", id, null, { archived: true });
  }

  // ── Feriados ────────────────────────────────────────────────────────
  async listHolidayCalendars(org: OrganizationId) {
    const [cals, days] = await Promise.all([this.repo.listHolidayCalendars(org), this.repo.listHolidayDays(org)]);
    return cals.map((c) => ({ ...c, days: days.filter((d) => d.calendarId === c.id).sort((a, b) => a.date.localeCompare(b.date)) }));
  }

  async createHolidayCalendar(org: OrganizationId, actor: string, input: Omit<HolidayCalendar, "id">) {
    const c = { ...input, name: input.name.trim() };
    validateHolidayCalendar(c);
    if ((await this.repo.listHolidayCalendars(org)).some((x) => lower(x.name) === lower(c.name))) throw new TimeConflictError("Já existe um calendário com este nome.", "duplicate_name", { field: "name" });
    const cal = await this.repo.createHolidayCalendar(org, c, actor);
    await this.log(org, actor, "time.holiday_calendar.create", "holiday_calendar", cal.id, null, cal);
    return cal;
  }

  async updateHolidayCalendar(org: OrganizationId, actor: string, id: string, patch: Partial<Omit<HolidayCalendar, "id">>) {
    const cur = (await this.repo.listHolidayCalendars(org)).find((c) => c.id === id);
    if (!cur) throw new TimeNotFoundError("Calendário não encontrado.");
    validateHolidayCalendar({ ...cur, ...patch });
    const next = await this.repo.updateHolidayCalendar(org, id, patch);
    await this.log(org, actor, "time.holiday_calendar.update", "holiday_calendar", id, cur, next);
    return next;
  }

  async addHoliday(org: OrganizationId, actor: string, calendarId: string, input: Omit<HolidayDay, "id" | "calendarId">) {
    if (!(await this.repo.listHolidayCalendars(org)).some((c) => c.id === calendarId)) throw new TimeNotFoundError("Calendário não encontrado.");
    const d = { ...input, name: input.name.trim() };
    validateHolidayDay(d);
    if ((await this.repo.listHolidayDays(org, calendarId)).some((x) => x.date === d.date)) throw new TimeValidationError("Já existe um feriado nesta data neste calendário.", "date");
    const [created] = await this.repo.insertHolidayDays(org, [{ ...d, calendarId }], actor);
    await this.log(org, actor, "time.holiday.add", "holiday_calendar", calendarId, null, created);
    return created!;
  }

  async updateHoliday(org: OrganizationId, actor: string, id: string, patch: Partial<Pick<HolidayDay, "name" | "status" | "coefficient" | "source" | "kind">>) {
    const cur = (await this.repo.listHolidayDays(org)).find((d) => d.id === id);
    if (!cur) throw new TimeNotFoundError("Feriado não encontrado.");
    validateHolidayDay({ ...cur, ...patch });
    if (patch.status && !["to_confirm", "confirmed"].includes(patch.status)) throw new TimeValidationError("Estado inválido.", "status");
    const next = await this.repo.updateHolidayDay(org, id, patch);
    await this.log(org, actor, patch.status === "confirmed" ? "time.holiday.confirm" : "time.holiday.update", "holiday_calendar", cur.calendarId, cur, next);
    return next;
  }

  async removeHoliday(org: OrganizationId, actor: string, id: string) {
    const cur = (await this.repo.listHolidayDays(org)).find((d) => d.id === id);
    if (!cur) throw new TimeNotFoundError("Feriado não encontrado.");
    await this.repo.deleteHolidayDay(org, id);
    await this.log(org, actor, "time.holiday.remove", "holiday_calendar", cur.calendarId, cur, null);
  }

  /**
   * CF-10: importa os feriados nacionais do país como "a confirmar"; nunca
   * substitui um dia já existente (regional/municipal ou já importado).
   */
  async importNational(org: OrganizationId, actor: string, calendarId: string, year: number) {
    const cal = (await this.repo.listHolidayCalendars(org)).find((c) => c.id === calendarId);
    if (!cal) throw new TimeNotFoundError("Calendário não encontrado.");
    if (!cal.country) throw new TimeValidationError("Indique o país do calendário antes de importar.", "country");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new TimeValidationError("Ano inválido.", "year");
    const list = this.national.forCountry(cal.country, year);
    if (!list) throw new TimeValidationError(`Ainda não há cálculo de feriados nacionais para ${cal.country}. Acrescente-os à mão com a fonte oficial.`, "country");
    const existing = new Set((await this.repo.listHolidayDays(org, calendarId)).map((d) => d.date));
    const toAdd = list.filter((h) => !existing.has(h.date));
    const created = toAdd.length
      ? await this.repo.insertHolidayDays(
          org,
          toAdd.map((h) => ({ calendarId, date: h.date, name: h.name, kind: "national" as const, status: "to_confirm" as const, coefficient: null, source: `Importação ${cal.country} ${year} — confirmar com fonte oficial` })),
          actor,
        )
      : [];
    await this.log(org, actor, "time.holiday.import", "holiday_calendar", calendarId, null, { year, added: created.length, skipped: list.length - created.length });
    return { added: created.length, skipped: list.length - created.length, days: created };
  }

  // ── Férias ──────────────────────────────────────────────────────────
  listVacationCalendars(org: OrganizationId) {
    return this.repo.listVacationCalendars(org);
  }

  async createVacationCalendar(org: OrganizationId, actor: string, input: Omit<VacationCalendar, "id">) {
    const v = { ...input, name: input.name.trim() };
    validateVacationCalendar(v);
    if ((await this.repo.listVacationCalendars(org)).some((x) => lower(x.name) === lower(v.name))) throw new TimeConflictError("Já existe um calendário de férias com este nome.", "duplicate_name", { field: "name" });
    const cal = await this.repo.createVacationCalendar(org, v, actor);
    await this.log(org, actor, "time.vacation_calendar.create", "vacation_calendar", cal.id, null, cal);
    return cal;
  }

  async updateVacationCalendar(org: OrganizationId, actor: string, id: string, input: Omit<VacationCalendar, "id">) {
    const cur = (await this.repo.listVacationCalendars(org)).find((c) => c.id === id);
    if (!cur) throw new TimeNotFoundError("Calendário de férias não encontrado.");
    const v = { ...input, name: input.name.trim() };
    validateVacationCalendar(v);
    if ((await this.repo.listVacationCalendars(org)).some((x) => x.id !== id && lower(x.name) === lower(v.name))) throw new TimeConflictError("Já existe um calendário de férias com este nome.", "duplicate_name", { field: "name" });
    const next = await this.repo.updateVacationCalendar(org, id, v);
    await this.log(org, actor, "time.vacation_calendar.update", "vacation_calendar", id, cur, next);
    return next;
  }

  // ── Eliminar com impacto (RE-35) ────────────────────────────────────
  async deletePreview(org: OrganizationId, type: "holiday_calendar" | "vacation_calendar", id: string): Promise<DeletePreview> {
    const today = await this.clock.today(org);
    const cal =
      type === "holiday_calendar" ? (await this.repo.listHolidayCalendars(org)).find((c) => c.id === id) : (await this.repo.listVacationCalendars(org)).find((c) => c.id === id);
    if (!cal) throw new TimeNotFoundError("Calendário não encontrado.");
    const assignments = (await this.repo.listAssignments(org)).filter((a) => a.resourceType === type && a.resourceId === id && (a.validTo === null || a.validTo >= today));
    const days = type === "holiday_calendar" ? (await this.repo.listHolidayDays(org, id)).length : 0;
    const employees = assignments.length ? await this.impact.countEmployees(org, assignments.map((a) => ({ targetType: a.targetType, targetId: a.targetId })), today) : 0;
    return { name: cal.name, days, employees, assignments: assignments.length };
  }

  /** Só elimina com a confirmação explícita (o nome do calendário escrito por quem apaga). */
  async deleteCalendar(org: OrganizationId, actor: string, type: "holiday_calendar" | "vacation_calendar", id: string, confirmName: string) {
    const preview = await this.deletePreview(org, type, id);
    if (confirmName.trim() !== preview.name) throw new TimeConflictError("Para eliminar, escreva o nome do calendário.", "confirmation_required", { preview });
    const today = await this.clock.today(org);
    for (const a of (await this.repo.listAssignments(org)).filter((x) => x.resourceType === type && x.resourceId === id && (x.validTo === null || x.validTo >= today))) {
      await this.repo.endAssignment(org, a.id, today < a.validFrom ? a.validFrom : today);
    }
    if (type === "holiday_calendar") await this.repo.deleteHolidayCalendar(org, id, actor);
    else await this.repo.deleteVacationCalendar(org, id, actor);
    await this.log(org, actor, `time.${type}.delete`, type, id, preview, null);
    return preview;
  }

  // ── Atribuições ─────────────────────────────────────────────────────
  listAssignments(org: OrganizationId) {
    return this.repo.listAssignments(org);
  }

  async assign(org: OrganizationId, actor: string, input: Omit<TimeAssignment, "id">) {
    if (!["schedule", "holiday_calendar", "vacation_calendar"].includes(input.resourceType)) throw new TimeValidationError("Tipo inválido.", "resourceType");
    if (!["employee", "group", "department", "location"].includes(input.targetType)) throw new TimeValidationError("Alvo inválido.", "targetType");
    if (!input.targetId) throw new TimeValidationError("Escolha a quem se aplica.", "targetId");
    if (!DATE.test(input.validFrom) || (input.validTo !== null && (!DATE.test(input.validTo) || input.validTo < input.validFrom))) throw new TimeValidationError("Vigência inválida.", "validFrom");
    const exists = await this.resourceExists(org, input.resourceType, input.resourceId);
    if (!exists) throw new TimeNotFoundError("Horário ou calendário não encontrado.");
    if (assignmentOverlaps(await this.repo.listAssignments(org), input)) throw new TimeConflictError("Já está atribuído a este alvo nesse período.", "assignment_overlap");
    const a = await this.repo.createAssignment(org, input, actor);
    await this.log(org, actor, "time.assignment.create", input.resourceType, input.resourceId, null, a);
    return a;
  }

  async endAssignment(org: OrganizationId, actor: string, id: string, validTo: string) {
    const cur = (await this.repo.listAssignments(org)).find((a) => a.id === id);
    if (!cur) throw new TimeNotFoundError("Atribuição não encontrada.");
    if (!DATE.test(validTo) || validTo < cur.validFrom || (cur.validTo !== null && validTo > cur.validTo)) throw new TimeValidationError("Só pode encurtar a vigência.", "validTo");
    const a = await this.repo.endAssignment(org, id, validTo);
    await this.log(org, actor, "time.assignment.end", cur.resourceType, cur.resourceId, cur, a);
    return a;
  }

  private async resourceExists(org: OrganizationId, type: ResourceType, id: string) {
    if (type === "schedule") return (await this.repo.listSchedules(org)).some((s) => s.id === id && !s.archived);
    if (type === "holiday_calendar") return (await this.repo.listHolidayCalendars(org)).some((c) => c.id === id);
    return (await this.repo.listVacationCalendars(org)).some((c) => c.id === id);
  }

  // ── Tempo teórico (TK-11) ───────────────────────────────────────────
  async theoretical(org: OrganizationId, employeeId: string, from: string, to: string, halfDays: string[] = []): Promise<{ days: TheoreticalDay[]; totalMinutes: number }> {
    if (!DATE.test(from) || !DATE.test(to) || to < from) throw new TimeValidationError("Período inválido.", "from");
    const dates = eachDate(from, to);
    if (dates.length > MAX_RANGE_DAYS) throw new TimeValidationError(`Máximo de ${MAX_RANGE_DAYS} dias por pedido.`, "to");
    const [schedules, versions, assignments, holidayDays] = await Promise.all([
      this.repo.listSchedules(org),
      this.repo.listVersions(org),
      this.repo.listAssignments(org),
      this.repo.listHolidayDays(org),
    ]);
    // O contexto de cada dia (unidades, modo, contrato) pede-se em paralelo — antes um dia de cada vez.
    const days: TheoreticalDay[] = await Promise.all(
      dates.map(async (date) => {
        const [units, mode] = await Promise.all([this.context.unitsAt(org, employeeId, date), this.context.theoreticalModeAt(org, employeeId, date)]);
        const sa = resolveAssignment(assignments, "schedule", units, date);
        const schedule = sa ? schedules.find((s) => s.id === sa.resourceId) : undefined;
        const version = schedule ? versionOn(versions.filter((v) => v.scheduleId === schedule.id), date) : null;
        const ha = resolveAssignment(assignments, "holiday_calendar", units, date);
        const holiday = ha ? (holidayDays.find((h) => h.calendarId === ha.resourceId && h.date === date) ?? null) : null;
        return theoreticalDay({
          date,
          schedule: schedule && version ? { kind: schedule.kind, name: schedule.name, version } : null,
          holiday,
          mode,
          contractWeeklyMinutes: mode === "contract" ? await this.context.contractWeeklyMinutesAt(org, employeeId, date) : null,
          halfDay: halfDays.includes(date),
        });
      }),
    );
    return { days, totalMinutes: days.reduce((s, d) => s + d.minutes, 0) };
  }

  /** Assignments ativos de um colaborador numa data (ficha → separador Tempo). */
  async assignmentsFor(org: OrganizationId, employeeId: string, date: string) {
    const [assignments, units] = await Promise.all([this.repo.listAssignments(org), this.context.unitsAt(org, employeeId, date)]);
    return {
      schedule: resolveAssignment(assignments, "schedule", units, date),
      holidayCalendar: resolveAssignment(assignments, "holiday_calendar", units, date),
      vacationCalendar: resolveAssignment(assignments, "vacation_calendar", units, date),
      active: assignments.filter((a) => activeOn(a, date)),
    };
  }
}
