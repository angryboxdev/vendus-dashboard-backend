import type { DateTime } from "luxon";
import type { ShiftOccurrence } from "../ports/out/shift-attendance-read.port.js";
import type { ActiveLeave } from "../ports/out/leave-read.port.js";
import type { AttendanceRulesVersion } from "../entities/attendance-rules.js";
import {
  attributeActualToPeriods,
  computeAttendanceIssue,
  describeAttendanceOccurrence,
  type AttendanceIssue,
  type AttendanceState,
} from "./attendance-conference.service.js";
import { classifyByTolerance, describeToleranceOccurrence, resolveEffectiveRules, type ToleranceOccurrenceKind } from "./attendance-tolerance.service.js";

/** Fase 2.1 — une o sinal manual (`AttendanceIssue.state`, sempre `CONFLITO`/etc.) com o automático por tolerância. */
export type AttendanceOccurrenceKind = ToleranceOccurrenceKind | "conflict" | "unscheduled_presence";

export interface AttendanceOccurrenceClassification {
  /** `null` quando esta linha só existe por causa da tolerância (sem sinal manual) — task, secção 16. */
  issue: AttendanceIssue | null;
  state: AttendanceState;
  occurrenceLabel: string;
  occurrenceKind: AttendanceOccurrenceKind;
  diffMinutes: number | null;
}

function deriveStateFromTolerance(kind: ToleranceOccurrenceKind, hasLeft: boolean): AttendanceState {
  switch (kind) {
    case "absence":
      return "AUSENTE";
    case "no_entry":
    case "no_exit":
      return "EM_ABERTO";
    case "early_exit":
      return "CONCLUIDO";
    case "late_entry":
    case "before_window":
      return hasLeft ? "CONCLUIDO" : "PRESENTE";
    default:
      return "REGULAR";
  }
}

/**
 * Classifica um turno planeado segundo os DOIS sinais em paralelo — o
 * manual existente (`computeAttendanceIssue`) e o automático por
 * tolerância (`classifyByTolerance`). Devolve `null` só quando NENHUM dos
 * dois sinaliza nada (turno "Regular", nunca aparece na Conferência).
 * Partilhado por `ListAttendanceIssuesUseCase`/`GetAttendanceIssueDetailUseCase`
 * — nunca duplicar esta combinação.
 */
export function classifyScheduledShift(
  shift: ShiftOccurrence,
  now: DateTime,
  opts: { hasOverlap: boolean; activeLeave: ActiveLeave | null; ruleVersions: AttendanceRulesVersion[] },
): AttendanceOccurrenceClassification | null {
  const existingIssue = computeAttendanceIssue(shift, now, opts);
  const periods = attributeActualToPeriods(shift);
  const toleranceApplicable = shift.attendanceStatus !== "cancelled" && !opts.activeLeave && !opts.hasOverlap;
  const effectiveRules = resolveEffectiveRules(opts.ruleVersions, shift.workDate);
  const tolerance = toleranceApplicable
    ? classifyByTolerance(periods, shift.workDate, shift.endsNextDay, effectiveRules, now)
    : { kind: "ok" as const, diffMinutes: null };

  const isConflict = existingIssue?.state === "CONFLITO";
  const occurrenceKind: AttendanceOccurrenceKind = isConflict ? "conflict" : tolerance.kind;
  const diffMinutes = isConflict ? null : tolerance.diffMinutes;

  if (!existingIssue && occurrenceKind === "ok") return null;

  const hasLeft = shift.actualEndTime != null;
  return {
    issue: existingIssue,
    state: existingIssue?.state ?? deriveStateFromTolerance(tolerance.kind, hasLeft),
    occurrenceLabel: existingIssue ? describeAttendanceOccurrence(existingIssue) : describeToleranceOccurrence(tolerance.kind, tolerance.diffMinutes),
    occurrenceKind,
    diffMinutes,
  };
}
