import { TimeValidationError } from "../errors.js";

/** Calendários de feriados (C5.1) e de férias (C5.2), atribuições com vigência. */

export type HolidayKind = "national" | "regional" | "municipal" | "custom";
export type HolidayStatus = "to_confirm" | "confirmed";

export interface HolidayCalendar {
  id: string;
  name: string;
  country: string | null;
  compensationCoefficient: number;
  approvalRequired: boolean;
  accruedExpires: boolean;
  halfDayCompensation: boolean;
}

export interface HolidayDay {
  id: string;
  calendarId: string;
  date: string;
  name: string;
  kind: HolidayKind;
  status: HolidayStatus;
  coefficient: number | null;
  source: string | null;
}

export interface VacationCalendar {
  id: string;
  name: string;
  unit: "days" | "hours";
  counting: "working" | "calendar";
  limited: boolean;
  /** Sem valor por omissão (D6). */
  maxAmount: number | null;
  renewal: "calendar_year" | "work_year" | "custom";
  renewalStart: string | null;
  seniorityRules: { afterYears: number; extra: number }[];
  cumulative: boolean;
  halfDay: boolean;
  allowNegative: boolean;
  minConsecutive: number | null;
  maxConsecutive: number | null;
  advanceMonths: number | null;
  blockedDates: string[];
}

export type ResourceType = "schedule" | "holiday_calendar" | "vacation_calendar";
export type TargetType = "employee" | "group" | "department" | "location";

export interface TimeAssignment {
  id: string;
  resourceType: ResourceType;
  resourceId: string;
  targetType: TargetType;
  targetId: string;
  validFrom: string;
  validTo: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (field: string, msg: string): never => {
  throw new TimeValidationError(msg, field);
};

export function validateHolidayCalendar(c: Omit<HolidayCalendar, "id">): void {
  if (!c.name.trim() || c.name.length > 120) fail("name", "O nome é obrigatório (máx. 120).");
  if (c.country !== null && !/^[A-Z]{2}$/.test(c.country)) fail("country", "País inválido (ex.: PT, ES).");
  if (!(c.compensationCoefficient >= 0 && c.compensationCoefficient <= 10)) fail("compensationCoefficient", "Coeficiente entre 0 e 10.");
}

export function validateHolidayDay(d: Omit<HolidayDay, "id" | "calendarId">): void {
  if (!DATE.test(d.date)) fail("date", "Data inválida.");
  if (!d.name.trim() || d.name.length > 120) fail("name", "O nome é obrigatório (máx. 120).");
  if (!["national", "regional", "municipal", "custom"].includes(d.kind)) fail("kind", "Tipo de feriado inválido.");
  if (d.coefficient !== null && !(d.coefficient >= 0 && d.coefficient <= 10)) fail("coefficient", "Coeficiente entre 0 e 10.");
}

export function validateVacationCalendar(v: Omit<VacationCalendar, "id">): void {
  if (!v.name.trim() || v.name.length > 120) fail("name", "O nome é obrigatório (máx. 120).");
  if (!["days", "hours"].includes(v.unit)) fail("unit", "Unidade inválida.");
  if (!["working", "calendar"].includes(v.counting)) fail("counting", "Contagem inválida.");
  if (v.maxAmount !== null && !(v.maxAmount >= 0)) fail("maxAmount", "Limite inválido.");
  if (v.renewal === "custom" && !/^\d{2}-\d{2}$/.test(v.renewalStart ?? "")) fail("renewalStart", "Indique o início do ano personalizado (MM-DD).");
  if (v.minConsecutive !== null && v.maxConsecutive !== null && v.maxConsecutive < v.minConsecutive) fail("maxConsecutive", "O máximo tem de ser ≥ mínimo.");
  if (v.blockedDates.some((d) => !DATE.test(d))) fail("blockedDates", "Datas bloqueadas inválidas.");
  if (v.seniorityRules.some((r) => !(r.afterYears >= 0 && r.extra >= 0))) fail("seniorityRules", "Regras de antiguidade inválidas.");
}

export const activeOn = (a: { validFrom: string; validTo: string | null }, date: string) => a.validFrom <= date && (a.validTo === null || date <= a.validTo);

export function assignmentOverlaps(existing: TimeAssignment[], next: Omit<TimeAssignment, "id">): boolean {
  return existing.some(
    (a) =>
      a.resourceType === next.resourceType &&
      a.resourceId === next.resourceId &&
      a.targetType === next.targetType &&
      a.targetId === next.targetId &&
      (a.validTo === null || next.validFrom <= a.validTo) &&
      (next.validTo === null || a.validFrom <= next.validTo),
  );
}

export interface EmployeeUnitsAt {
  employeeId: string;
  locationIds: string[];
  departmentIds: string[];
  groupIds: string[];
}

const PRIORITY: TargetType[] = ["employee", "group", "department", "location"];

/**
 * Que horário/calendário vale para o colaborador numa data. Mesma ordem do
 * motor de configurações (D3): pessoal > grupo > departamento > centro;
 * empate → atribuição mais recente, depois id.
 */
export function resolveAssignment(all: TimeAssignment[], type: ResourceType, who: EmployeeUnitsAt, date: string): TimeAssignment | null {
  const member: Record<TargetType, string[]> = { employee: [who.employeeId], group: who.groupIds, department: who.departmentIds, location: who.locationIds };
  const candidates = all.filter((a) => a.resourceType === type && activeOn(a, date) && member[a.targetType].includes(a.targetId));
  candidates.sort(
    (a, b) => PRIORITY.indexOf(a.targetType) - PRIORITY.indexOf(b.targetType) || b.validFrom.localeCompare(a.validFrom) || a.id.localeCompare(b.id),
  );
  return candidates[0] ?? null;
}
