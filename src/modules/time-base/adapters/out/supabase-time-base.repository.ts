import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { HolidayCalendar, HolidayDay, TimeAssignment, VacationCalendar } from "../../domain/entities/calendars.js";
import type { ScheduleKind, ScheduleVersion, WorkSchedule } from "../../domain/entities/schedule.js";
import type { TimeBaseRepositoryPort } from "../../domain/ports/out/time-base.ports.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const SCH = "id, name, kind, archived";
const VER = "id, schedule_id, valid_from, valid_to, days, night, half_day_minutes";
const HC = "id, name, country, compensation_coefficient, approval_required, accrued_expires, half_day_compensation";
const HD = "id, calendar_id, date, name, kind, status, coefficient, source";
const VC =
  "id, name, unit, counting, limited, max_amount, renewal, renewal_start, seniority_rules, cumulative, half_day, allow_negative, min_consecutive, max_consecutive, advance_months, blocked_dates";
const AS = "id, resource_type, resource_id, target_type, target_id, valid_from, valid_to";

const toSchedule = (r: Row): WorkSchedule => ({ id: String(r.id), name: String(r.name), kind: r.kind as ScheduleKind, archived: r.archived === true });
const toVersion = (r: Row): ScheduleVersion => ({
  id: String(r.id),
  scheduleId: String(r.schedule_id),
  validFrom: String(r.valid_from),
  validTo: str(r.valid_to),
  days: (r.days ?? {}) as ScheduleVersion["days"],
  night: r.night === true,
  halfDayMinutes: num(r.half_day_minutes),
});
const toHC = (r: Row): HolidayCalendar => ({
  id: String(r.id),
  name: String(r.name),
  country: str(r.country),
  compensationCoefficient: Number(r.compensation_coefficient),
  approvalRequired: r.approval_required === true,
  accruedExpires: r.accrued_expires === true,
  halfDayCompensation: r.half_day_compensation === true,
});
const hcRow = (c: Partial<Omit<HolidayCalendar, "id">>) => {
  const row: Row = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.country !== undefined) row.country = c.country;
  if (c.compensationCoefficient !== undefined) row.compensation_coefficient = c.compensationCoefficient;
  if (c.approvalRequired !== undefined) row.approval_required = c.approvalRequired;
  if (c.accruedExpires !== undefined) row.accrued_expires = c.accruedExpires;
  if (c.halfDayCompensation !== undefined) row.half_day_compensation = c.halfDayCompensation;
  return row;
};
const toHD = (r: Row): HolidayDay => ({
  id: String(r.id),
  calendarId: String(r.calendar_id),
  date: String(r.date),
  name: String(r.name),
  kind: r.kind as HolidayDay["kind"],
  status: r.status as HolidayDay["status"],
  coefficient: num(r.coefficient),
  source: str(r.source),
});
const toVC = (r: Row): VacationCalendar => ({
  id: String(r.id),
  name: String(r.name),
  unit: r.unit as VacationCalendar["unit"],
  counting: r.counting as VacationCalendar["counting"],
  limited: r.limited === true,
  maxAmount: num(r.max_amount),
  renewal: r.renewal as VacationCalendar["renewal"],
  renewalStart: str(r.renewal_start),
  seniorityRules: (r.seniority_rules ?? []) as VacationCalendar["seniorityRules"],
  cumulative: r.cumulative === true,
  halfDay: r.half_day === true,
  allowNegative: r.allow_negative === true,
  minConsecutive: num(r.min_consecutive),
  maxConsecutive: num(r.max_consecutive),
  advanceMonths: num(r.advance_months),
  blockedDates: (r.blocked_dates ?? []) as string[],
});
const vcRow = (v: Omit<VacationCalendar, "id">) => ({
  name: v.name,
  unit: v.unit,
  counting: v.counting,
  limited: v.limited,
  max_amount: v.maxAmount,
  renewal: v.renewal,
  renewal_start: v.renewalStart,
  seniority_rules: v.seniorityRules,
  cumulative: v.cumulative,
  half_day: v.halfDay,
  allow_negative: v.allowNegative,
  min_consecutive: v.minConsecutive,
  max_consecutive: v.maxConsecutive,
  advance_months: v.advanceMonths,
  blocked_dates: v.blockedDates,
});
const toAS = (r: Row): TimeAssignment => ({
  id: String(r.id),
  resourceType: r.resource_type as TimeAssignment["resourceType"],
  resourceId: String(r.resource_id),
  targetType: r.target_type as TimeAssignment["targetType"],
  targetId: String(r.target_id),
  validFrom: String(r.valid_from),
  validTo: str(r.valid_to),
});

export class SupabaseTimeBaseRepository implements TimeBaseRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async listSchedules(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("work_schedules").select(SCH).order("name")).map(toSchedule);
  }
  async createSchedule(org: OrganizationId, i: { name: string; kind: ScheduleKind }, by: string) {
    return toSchedule(check(await this.scoped(org).table("work_schedules").insert({ ...i, created_by: by }).select(SCH).single()));
  }
  async archiveSchedule(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("work_schedules").update({ archived: true }).eq("id", id));
  }
  async listVersions(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("work_schedule_versions").select(VER).order("valid_from")).map(toVersion);
  }
  async createVersion(org: OrganizationId, v: Omit<ScheduleVersion, "id">, by: string) {
    const row = { schedule_id: v.scheduleId, valid_from: v.validFrom, valid_to: v.validTo, days: v.days, night: v.night, half_day_minutes: v.halfDayMinutes, created_by: by };
    return toVersion(check(await this.scoped(org).table("work_schedule_versions").insert(row).select(VER).single()));
  }
  async endVersion(org: OrganizationId, id: string, validTo: string) {
    check(await this.scoped(org).table("work_schedule_versions").update({ valid_to: validTo }).eq("id", id));
  }

  async listHolidayCalendars(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("holiday_calendars").select(HC).is("deleted_at", null).order("name")).map(toHC);
  }
  async createHolidayCalendar(org: OrganizationId, c: Omit<HolidayCalendar, "id">, by: string) {
    return toHC(check(await this.scoped(org).table("holiday_calendars").insert({ ...hcRow(c), created_by: by }).select(HC).single()));
  }
  async updateHolidayCalendar(org: OrganizationId, id: string, patch: Partial<Omit<HolidayCalendar, "id">>) {
    return toHC(check(await this.scoped(org).table("holiday_calendars").update(hcRow(patch)).eq("id", id).select(HC).single()));
  }
  async deleteHolidayCalendar(org: OrganizationId, id: string, by: string) {
    check(await this.scoped(org).table("holiday_calendars").update({ deleted_at: new Date().toISOString(), deleted_by: by }).eq("id", id));
  }
  async listHolidayDays(org: OrganizationId, calendarId?: string) {
    let q = this.scoped(org).table("holiday_calendar_days").select(HD);
    if (calendarId) q = q.eq("calendar_id", calendarId);
    return check<Row[]>(await q.order("date")).map(toHD);
  }
  async insertHolidayDays(org: OrganizationId, days: Omit<HolidayDay, "id">[], by: string) {
    const rows = days.map((d) => ({ calendar_id: d.calendarId, date: d.date, name: d.name, kind: d.kind, status: d.status, coefficient: d.coefficient, source: d.source, created_by: by }));
    return check<Row[]>(await this.scoped(org).table("holiday_calendar_days").insert(rows).select(HD)).map(toHD);
  }
  async updateHolidayDay(org: OrganizationId, id: string, p: Partial<Omit<HolidayDay, "id" | "calendarId">>) {
    const row: Row = {};
    for (const k of ["date", "name", "kind", "status", "coefficient", "source"] as const) if (p[k] !== undefined) row[k] = p[k];
    return toHD(check(await this.scoped(org).table("holiday_calendar_days").update(row).eq("id", id).select(HD).single()));
  }
  async deleteHolidayDay(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("holiday_calendar_days").delete().eq("id", id));
  }

  async listVacationCalendars(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("vacation_calendars").select(VC).is("deleted_at", null).order("name")).map(toVC);
  }
  async createVacationCalendar(org: OrganizationId, v: Omit<VacationCalendar, "id">, by: string) {
    return toVC(check(await this.scoped(org).table("vacation_calendars").insert({ ...vcRow(v), created_by: by }).select(VC).single()));
  }
  async updateVacationCalendar(org: OrganizationId, id: string, v: Omit<VacationCalendar, "id">) {
    return toVC(check(await this.scoped(org).table("vacation_calendars").update(vcRow(v)).eq("id", id).select(VC).single()));
  }
  async deleteVacationCalendar(org: OrganizationId, id: string, by: string) {
    check(await this.scoped(org).table("vacation_calendars").update({ deleted_at: new Date().toISOString(), deleted_by: by }).eq("id", id));
  }

  async listAssignments(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("time_assignments").select(AS).order("valid_from")).map(toAS);
  }
  async createAssignment(org: OrganizationId, a: Omit<TimeAssignment, "id">, by: string) {
    const row = { resource_type: a.resourceType, resource_id: a.resourceId, target_type: a.targetType, target_id: a.targetId, valid_from: a.validFrom, valid_to: a.validTo, created_by: by };
    return toAS(check(await this.scoped(org).table("time_assignments").insert(row).select(AS).single()));
  }
  async endAssignment(org: OrganizationId, id: string, validTo: string) {
    return toAS(check(await this.scoped(org).table("time_assignments").update({ valid_to: validTo }).eq("id", id).select(AS).single()));
  }
}
