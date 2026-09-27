import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvalidRecurrenceSpecError } from "../../domain/errors.js";
import {
  expandRecurrence,
  partitionOccurrences,
  type PlannedOccurrence,
  type RecurrenceSpec,
  type WeeklyDayRule,
} from "../../domain/services/shift-recurrence.service.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import type {
  PlannedOccurrenceDTO,
  RepeatModeDTO,
  WeeklyDayRuleDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { addDays } from "./schedule-shared.js";

const MAX_SPAN_DAYS = 366;

/** Valida a especificação recebida antes de expandir — mensagens claras em vez de deixar o motor de recorrência produzir uma lista vazia silenciosamente. */
function validateRules(rules: WeeklyDayRuleDTO[]): void {
  if (rules.length === 0) throw new InvalidRecurrenceSpecError("Define pelo menos um horário para algum dia da semana");

  const claimedWeekdays = new Set<number>();
  for (const rule of rules) {
    if (rule.segments.length === 0 || rule.segments.length > 2) {
      throw new InvalidRecurrenceSpecError("Cada dia tem de ter 1 período (turno direto) ou 2 (turno repartido)");
    }
    for (const weekday of rule.weekdays) {
      if (claimedWeekdays.has(weekday)) {
        throw new InvalidRecurrenceSpecError("Cada dia da semana só pode ter um horário — remove a regra duplicada antes de continuar");
      }
      claimedWeekdays.add(weekday);
    }
  }
}

function toRecurrenceRule(rule: WeeklyDayRuleDTO): WeeklyDayRule {
  return {
    weekdays: rule.weekdays,
    segments: rule.segments,
    ...(rule.endsNextDay !== undefined && { endsNextDay: rule.endsNextDay }),
  };
}

export function toPlannedOccurrenceDTO(
  occurrence: PlannedOccurrence,
  status: PlannedOccurrenceDTO["status"],
): PlannedOccurrenceDTO {
  return {
    workDate: occurrence.workDate,
    weekday: occurrence.weekday,
    segments: occurrence.segments,
    endsNextDay: occurrence.endsNextDay,
    status,
  };
}

export interface SeriesPartitionResult {
  toCreate: PlannedOccurrence[];
  conflicts: PlannedOccurrence[];
  skipped: Array<PlannedOccurrence & { reason: "leave" | "holiday" }>;
}

/**
 * Motor partilhado por `PreviewWorkShiftSeriesUseCase` e
 * `CreateWorkShiftSeriesUseCase` — garante que o preview usa exatamente as
 * mesmas regras que a criação (task "Novo Turno Padrão Semanal", secção 8).
 */
export async function computeSeriesPartition(params: {
  organizationId: OrganizationId;
  employeeId: string;
  startDate: string;
  rules: WeeklyDayRuleDTO[];
  repeat: RepeatModeDTO;
  workShiftRepository: WorkShiftRepositoryPort;
  leaveRead: LeaveReadPort;
  holidayRead: HolidayReadPort;
}): Promise<SeriesPartitionResult> {
  validateRules(params.rules);
  if (params.repeat.kind === "weeks" && (params.repeat.weeks < 1 || params.repeat.weeks > 52)) {
    throw new InvalidRecurrenceSpecError("Número de semanas tem de estar entre 1 e 52");
  }

  const spec: RecurrenceSpec = {
    startDate: params.startDate,
    rules: params.rules.map(toRecurrenceRule),
    repeat: params.repeat,
  };
  const occurrences = expandRecurrence(spec);
  if (occurrences.length === 0) {
    throw new InvalidRecurrenceSpecError("Este padrão não gera nenhum turno no período escolhido");
  }
  if (occurrences.length > MAX_SPAN_DAYS) {
    throw new InvalidRecurrenceSpecError("Período demasiado longo — reduz o número de semanas ou a data final");
  }

  const rangeFrom = occurrences[0]!.workDate;
  const rangeTo = addDays(occurrences[occurrences.length - 1]!.workDate, 1); // +1 dia: cobre turnos noturnos que acabam no dia seguinte ao último

  const [existingShifts, leaves, holidays] = await Promise.all([
    params.workShiftRepository.findInRange(params.organizationId, {
      from: addDays(rangeFrom, -1),
      to: rangeTo,
      employeeId: params.employeeId,
    }),
    params.leaveRead.findActiveInRange(params.organizationId, rangeFrom, rangeTo),
    params.holidayRead.findInRange(params.organizationId, rangeFrom, rangeTo),
  ]);

  const employeeOnLeaveDates = new Set(
    leaves
      .filter((l) => l.employeeId === params.employeeId)
      .flatMap((l) => {
        const dates: string[] = [];
        for (let d = l.startDate; d <= l.endDate; d = addDays(d, 1)) dates.push(d);
        return dates;
      }),
  );
  const holidayDates = new Set(holidays.map((h) => h.date));

  return partitionOccurrences({ occurrences, existingShifts, employeeOnLeaveDates, holidayDates });
}
