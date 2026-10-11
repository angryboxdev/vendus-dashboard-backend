import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { EmployeeUnitsAt, HolidayCalendar, HolidayDay, TimeAssignment, TargetType, VacationCalendar } from "../../entities/calendars.js";
import type { ScheduleKind, ScheduleVersion, WorkSchedule } from "../../entities/schedule.js";
import type { TheoreticalMode } from "../../services/theoretical.service.js";

export interface TimeBaseRepositoryPort {
  listSchedules(org: OrganizationId): Promise<WorkSchedule[]>;
  createSchedule(org: OrganizationId, input: { name: string; kind: ScheduleKind }, by: string): Promise<WorkSchedule>;
  archiveSchedule(org: OrganizationId, id: string): Promise<void>;
  listVersions(org: OrganizationId): Promise<ScheduleVersion[]>;
  createVersion(org: OrganizationId, input: Omit<ScheduleVersion, "id">, by: string): Promise<ScheduleVersion>;
  /** Termina uma versão aberta (só encurta). */
  endVersion(org: OrganizationId, id: string, validTo: string): Promise<void>;

  listHolidayCalendars(org: OrganizationId): Promise<HolidayCalendar[]>;
  createHolidayCalendar(org: OrganizationId, input: Omit<HolidayCalendar, "id">, by: string): Promise<HolidayCalendar>;
  updateHolidayCalendar(org: OrganizationId, id: string, patch: Partial<Omit<HolidayCalendar, "id">>): Promise<HolidayCalendar>;
  deleteHolidayCalendar(org: OrganizationId, id: string, by: string): Promise<void>;
  listHolidayDays(org: OrganizationId, calendarId?: string): Promise<HolidayDay[]>;
  insertHolidayDays(org: OrganizationId, days: Omit<HolidayDay, "id">[], by: string): Promise<HolidayDay[]>;
  updateHolidayDay(org: OrganizationId, id: string, patch: Partial<Omit<HolidayDay, "id" | "calendarId">>): Promise<HolidayDay>;
  deleteHolidayDay(org: OrganizationId, id: string): Promise<void>;

  listVacationCalendars(org: OrganizationId): Promise<VacationCalendar[]>;
  createVacationCalendar(org: OrganizationId, input: Omit<VacationCalendar, "id">, by: string): Promise<VacationCalendar>;
  updateVacationCalendar(org: OrganizationId, id: string, input: Omit<VacationCalendar, "id">): Promise<VacationCalendar>;
  deleteVacationCalendar(org: OrganizationId, id: string, by: string): Promise<void>;

  listAssignments(org: OrganizationId): Promise<TimeAssignment[]>;
  createAssignment(org: OrganizationId, input: Omit<TimeAssignment, "id">, by: string): Promise<TimeAssignment>;
  endAssignment(org: OrganizationId, id: string, validTo: string): Promise<TimeAssignment>;
}

/** O que o cálculo precisa de saber do colaborador (outros módulos, via composition root). */
export interface EmployeeTimeContextPort {
  unitsAt(org: OrganizationId, employeeId: string, date: string): Promise<EmployeeUnitsAt>;
  contractWeeklyMinutesAt(org: OrganizationId, employeeId: string, date: string): Promise<number | null>;
  theoreticalModeAt(org: OrganizationId, employeeId: string, date: string): Promise<TheoreticalMode>;
}

/** Colaboradores abrangidos por alvos (pré-visualização de impacto — RE-35). */
export interface TimeImpactPort {
  countEmployees(org: OrganizationId, targets: { targetType: TargetType; targetId: string }[], date: string): Promise<number>;
}

/** Feriados nacionais calculados (hoje: PT, do módulo calendar). null = país sem cálculo. */
export interface NationalHolidaysPort {
  forCountry(country: string, year: number): { date: string; name: string }[] | null;
}

export interface TimeAuditPort {
  record(
    org: OrganizationId,
    e: { actor: string; action: string; resourceType: string; resourceId: string | null; before: unknown; after: unknown; reason: string | null },
  ): Promise<void>;
}

export interface TimeClockPort {
  today(org: OrganizationId): Promise<string>;
}
