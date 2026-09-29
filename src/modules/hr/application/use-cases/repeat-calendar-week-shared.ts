import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { WorkShift } from "../../domain/entities/work-shift.js";
import type { Weekday } from "../../domain/entities/base-schedule-template.js";
import type { WeeklyDayRule } from "../../domain/services/shift-recurrence.service.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import { InvalidRecurrenceSpecError } from "../../domain/errors.js";
import type { RepeatModeDTO, RepeatWeekEmployeeDTO } from "../../domain/ports/in/schedule.ports.js";
import { computeSeriesPartition, toPlannedOccurrenceDTO, type SeriesPartitionResult } from "./shift-series-shared.js";
import { addDays, weekDatesFrom, weekdayOf } from "./schedule-shared.js";

/** Segunda-feira imediatamente a seguir à semana de origem — mesmo exemplo da task ("28/09–04/10" → destino "05/10"). */
export function repeatWeekTargetStartDate(sourceWeekStartDate: string): string {
  return addDays(sourceWeekStartDate, 7);
}

/**
 * Turnos da semana de origem, filtrados aos dias da semana escolhidos e
 * (se indicado) aos colaboradores escolhidos. Nunca inclui turnos
 * cancelados — não faz sentido "repetir" um turno que nunca aconteceu.
 */
export function filterSourceWeekShifts(
  shifts: WorkShift[],
  sourceWeekStartDate: string,
  weekdays: readonly Weekday[],
  employeeIds: readonly string[] | undefined,
): WorkShift[] {
  const sourceDates = new Set(weekDatesFrom(sourceWeekStartDate));
  const weekdaySet = new Set(weekdays);
  const employeeSet = employeeIds && employeeIds.length > 0 ? new Set(employeeIds) : null;
  return shifts.filter(
    (s) =>
      sourceDates.has(s.workDate) &&
      weekdaySet.has(weekdayOf(s.workDate)) &&
      (!employeeSet || employeeSet.has(s.employeeId)),
  );
}

/** Agrupa turnos por (colaborador, local) — cada grupo vira uma chamada própria a `computeSeriesPartition`, para nunca misturar locais diferentes do mesmo colaborador numa só série. */
export function groupShiftsByEmployeeAndLocation(shifts: readonly WorkShift[]): Map<string, WorkShift[]> {
  const groups = new Map<string, WorkShift[]>();
  for (const s of shifts) {
    const key = `${s.employeeId}\u0000${s.locationId}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  return groups;
}

/** 1 regra por combinação exata de horário (1 ou 2 períodos + noturno) — vários dias com o mesmo horário viram 1 só regra, mesma ideia do `ShiftSeriesForm` no frontend. */
export function buildRulesFromShifts(shifts: readonly WorkShift[]): WeeklyDayRule[] {
  const byShape = new Map<string, WeeklyDayRule>();
  for (const s of shifts) {
    const weekday = weekdayOf(s.workDate);
    const shapeKey = `${s.startTime}|${s.endTime}|${s.secondStartTime ?? ""}|${s.secondEndTime ?? ""}|${s.endsNextDay}`;
    let rule = byShape.get(shapeKey);
    if (!rule) {
      rule = {
        weekdays: [],
        segments: [
          { startTime: s.startTime, endTime: s.endTime },
          ...(s.secondStartTime && s.secondEndTime ? [{ startTime: s.secondStartTime, endTime: s.secondEndTime }] : []),
        ],
        ...(s.endsNextDay && { endsNextDay: true }),
      };
      byShape.set(shapeKey, rule);
    }
    if (!rule.weekdays.includes(weekday)) rule.weekdays.push(weekday);
  }
  return [...byShape.values()];
}

export interface RepeatWeekGroupPartition {
  employeeId: string;
  locationId: string;
  partition: SeriesPartitionResult;
}

/**
 * `rotateEmployees: true` → em vez de cada colaborador receber o seu
 * próprio horário, cada um recebe o horário do **seguinte** na lista
 * `employeeIds` (ordem dada pelo pedido), com "wrap-around" no fim — 2
 * colaboradores = troca simples; 3+ = rotação circular. Pedido do
 * utilizador: "Copiar semana" e "Repetir escala" faziam a mesma coisa;
 * este modo dá um propósito próprio a "Copiar semana" (alternar/inverter
 * turnos entre colaboradores em vez de duplicar às cegas).
 */
function buildRotationMap(employeeIds: readonly string[] | undefined, filtered: readonly WorkShift[]): Map<string, string> {
  const orderedIds = employeeIds && employeeIds.length > 0 ? [...employeeIds] : [...new Set(filtered.map((s) => s.employeeId))];
  if (orderedIds.length < 2) {
    throw new InvalidRecurrenceSpecError("Alternar turnos exige pelo menos 2 colaboradores selecionados");
  }
  const map = new Map<string, string>();
  orderedIds.forEach((id, i) => map.set(id, orderedIds[(i + 1) % orderedIds.length]!));
  return map;
}

/**
 * Motor único partilhado pelo preview e pela criação (task, secção 6: "o
 * preview deve usar as mesmas regras do backend que serão usadas na
 * gravação") — 1 chamada a `computeSeriesPartition` por (colaborador,
 * local) encontrado na semana de origem.
 */
export async function computeRepeatWeekPartitions(params: {
  organizationId: OrganizationId;
  sourceWeekStartDate: string;
  weekdays: readonly Weekday[];
  employeeIds: readonly string[] | undefined;
  repeat: RepeatModeDTO;
  /** Alterna o horário de cada colaborador com o do seguinte na lista `employeeIds` — ver `buildRotationMap`. */
  rotateEmployees?: boolean;
  workShiftRepository: WorkShiftRepositoryPort;
  leaveRead: LeaveReadPort;
  holidayRead: HolidayReadPort;
}): Promise<RepeatWeekGroupPartition[]> {
  const sourceShifts = await params.workShiftRepository.findInRange(params.organizationId, {
    from: params.sourceWeekStartDate,
    to: addDays(params.sourceWeekStartDate, 6),
  });
  const filtered = filterSourceWeekShifts(sourceShifts, params.sourceWeekStartDate, params.weekdays, params.employeeIds);
  const groups = groupShiftsByEmployeeAndLocation(filtered);
  const targetStartDate = repeatWeekTargetStartDate(params.sourceWeekStartDate);
  const rotationMap = params.rotateEmployees ? buildRotationMap(params.employeeIds, filtered) : null;

  const results: RepeatWeekGroupPartition[] = [];
  for (const [key, groupShifts] of groups) {
    const [sourceEmployeeId, locationId] = key.split("\u0000") as [string, string];
    const targetEmployeeId = rotationMap?.get(sourceEmployeeId) ?? sourceEmployeeId;
    const rules = buildRulesFromShifts(groupShifts);
    const partition = await computeSeriesPartition({
      organizationId: params.organizationId,
      employeeId: targetEmployeeId,
      startDate: targetStartDate,
      rules,
      repeat: params.repeat,
      workShiftRepository: params.workShiftRepository,
      leaveRead: params.leaveRead,
      holidayRead: params.holidayRead,
    });
    results.push({ employeeId: targetEmployeeId, locationId, partition });
  }
  return results;
}

/** Agrega partições (possivelmente várias por colaborador, uma por local) no DTO por colaborador do preview. */
export function toRepeatWeekEmployeeDTOs(
  groups: readonly RepeatWeekGroupPartition[],
  employeeNameById: ReadonlyMap<string, string>,
): RepeatWeekEmployeeDTO[] {
  const byEmployee = new Map<string, RepeatWeekEmployeeDTO>();
  for (const g of groups) {
    const occurrences = [
      ...g.partition.toCreate.map((o) => toPlannedOccurrenceDTO(o, "available" as const)),
      ...g.partition.conflicts.map((o) => toPlannedOccurrenceDTO(o, "conflict" as const)),
      ...g.partition.skipped.map((o) =>
        toPlannedOccurrenceDTO(o, o.reason === "leave" ? ("skipped_leave" as const) : ("skipped_holiday" as const)),
      ),
    ].sort((a, b) => a.workDate.localeCompare(b.workDate));

    const locationGroup = {
      locationId: g.locationId,
      availableCount: g.partition.toCreate.length,
      conflictCount: g.partition.conflicts.length,
      skippedCount: g.partition.skipped.length,
      occurrences,
    };

    const existing = byEmployee.get(g.employeeId);
    if (existing) {
      existing.locations.push(locationGroup);
      existing.availableCount += locationGroup.availableCount;
      existing.conflictCount += locationGroup.conflictCount;
      existing.skippedCount += locationGroup.skippedCount;
    } else {
      byEmployee.set(g.employeeId, {
        employeeId: g.employeeId,
        employeeName: employeeNameById.get(g.employeeId) ?? g.employeeId,
        availableCount: locationGroup.availableCount,
        conflictCount: locationGroup.conflictCount,
        skippedCount: locationGroup.skippedCount,
        locations: [locationGroup],
      });
    }
  }
  return [...byEmployee.values()];
}
