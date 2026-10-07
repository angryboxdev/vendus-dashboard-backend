import { plannedRange } from "./shift-clock.service.js";

/**
 * "Confirmar ausência" (Assiduidade): que ausências já registadas
 * correspondem a uma ocorrência. Compatível = ausência ativa do mesmo
 * colaborador que cobre o dia — de dia inteiro, ou parcial nesse dia com
 * horário sobreposto ao do turno (ex.: turno 10:00–18:00, ausência
 * 10:00–14:00 → compatível; ausência 19:00–20:00 → não).
 */
export interface MatchableAbsence {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  minutes: number | null;
}

export interface OccurrenceWindow {
  workDate: string;
  /** Sem turno (presença sem escala): qualquer ausência do dia conta. */
  startTime: string | null;
  endTime: string | null;
  endsNextDay: boolean;
}

export function isCompatibleAbsence(a: MatchableAbsence, w: OccurrenceWindow): boolean {
  if (a.status !== "active") return false;
  if (a.startDate > w.workDate || a.endDate < w.workDate) return false;
  // Dia inteiro ou meio dia sem horas → cobre o dia.
  if (!a.startTime || !a.endTime || !w.startTime || !w.endTime) return true;
  const shift = plannedRange(w.startTime, w.endTime, w.endsNextDay);
  const abs = plannedRange(a.startTime, a.endTime, false);
  return abs.start < shift.end && shift.start < abs.end;
}

export function compatibleAbsences<T extends MatchableAbsence>(absences: T[], w: OccurrenceWindow): T[] {
  return absences.filter((a) => isCompatibleAbsence(a, w));
}
