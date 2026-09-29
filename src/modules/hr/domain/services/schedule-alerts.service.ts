import type { WorkShift } from "../entities/work-shift.js";
import type { BaseScheduleTemplate, Weekday } from "../entities/base-schedule-template.js";

export interface ShiftOverlap {
  employeeId: string;
  workDate: string;
  shiftIds: string[];
}

/**
 * Dois turnos do mesmo colaborador, no mesmo dia, com horários que se
 * intersectam — "Conflitos de sobreposição" do painel Alertas e ações.
 * Pura: opera só sobre a lista já carregada, sem tocar em infraestrutura.
 */
export function detectOverlaps(shifts: readonly WorkShift[]): ShiftOverlap[] {
  const byEmployeeDate = new Map<string, WorkShift[]>();
  for (const shift of shifts) {
    const key = `${shift.employeeId}:${shift.workDate}`;
    const list = byEmployeeDate.get(key) ?? [];
    list.push(shift);
    byEmployeeDate.set(key, list);
  }

  const overlaps: ShiftOverlap[] = [];
  for (const group of byEmployeeDate.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const overlappingIds = new Set<string>();
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]!;
      const next = sorted[i + 1]!;
      if (current.endTime > next.startTime) {
        overlappingIds.add(current.id);
        overlappingIds.add(next.id);
      }
    }
    if (overlappingIds.size > 0) {
      overlaps.push({
        employeeId: sorted[0]!.employeeId,
        workDate: sorted[0]!.workDate,
        shiftIds: [...overlappingIds],
      });
    }
  }
  return overlaps;
}

export interface CoverageGap {
  employeeId: string;
  workDate: string;
  locationId: string | null;
}

/**
 * Um dia em que a escala base de um colaborador prevê trabalho (não é
 * "Folga") mas não há turno publicado nem em rascunho nessa data, e o
 * colaborador não está de férias/ausência nem é feriado — "Falta de
 * cobertura" do painel Alertas e ações. Sem escala base configurada para um
 * colaborador, nunca gera alerta para ele (não há base de comparação).
 */
export function detectMissingCoverage(params: {
  templatesByEmployee: ReadonlyMap<string, readonly BaseScheduleTemplate[]>;
  shifts: readonly WorkShift[];
  weekDates: readonly string[];
  weekdayOf: (dateYmd: string) => Weekday;
  employeeIdsOnLeaveByDate: ReadonlyMap<string, ReadonlySet<string>>;
  holidayDates: ReadonlySet<string>;
}): CoverageGap[] {
  const { templatesByEmployee, shifts, weekDates, weekdayOf, employeeIdsOnLeaveByDate, holidayDates } = params;

  const shiftExistsByEmployeeDate = new Set(shifts.map((s) => `${s.employeeId}:${s.workDate}`));
  const gaps: CoverageGap[] = [];

  for (const [employeeId, templates] of templatesByEmployee) {
    const byWeekday = new Map(templates.map((t) => [t.weekday, t]));
    for (const dateYmd of weekDates) {
      if (holidayDates.has(dateYmd)) continue;
      if (employeeIdsOnLeaveByDate.get(dateYmd)?.has(employeeId)) continue;

      const template = byWeekday.get(weekdayOf(dateYmd));
      if (!template || template.isDayOff) continue;
      if (shiftExistsByEmployeeDate.has(`${employeeId}:${dateYmd}`)) continue;

      gaps.push({ employeeId, workDate: dateYmd, locationId: template.locationId });
    }
  }
  return gaps;
}

/** Turnos ainda em rascunho (não publicados) dentro de um período — "Turnos por publicar". */
export function countPendingPublish(shifts: readonly WorkShift[]): number {
  return shifts.filter((s) => s.status === "draft").length;
}
