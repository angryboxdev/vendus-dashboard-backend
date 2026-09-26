import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { ShiftOccurrence } from "../ports/out/shift-attendance-read.port.js";

/**
 * Tolerância de atraso — constante do módulo (mesmo valor do mockup da
 * RH-01), não configurável por organização nesta fase. Mesma simplificação
 * documentada já usada para `EXPIRING_SOON_DAYS` na RH-02.
 */
export const LATE_TOLERANCE_MINUTES = 10;

/**
 * Estado atual de UM turno (não confundir com o estado do dia de um
 * colaborador, que pode combinar vários turnos — ver
 * `overview-kpi.service.ts`). `CONFLITO` não é produzido aqui: só existe ao
 * comparar vários turnos do mesmo colaborador (ver `computeEmployeeConflicts`).
 */
export type ShiftState =
  | "AGENDADO"
  | "EM_TOLERANCIA"
  | "PRESENTE"
  | "ATRASADO_AGUARDANDO_ENTRADA"
  | "FINALIZADO"
  | "AUSENTE_OPERACIONAL";

export type ShiftException =
  | "CHEGADA_ATRASADA"
  | "SAIDA_ANTECIPADA"
  | "SEM_SAIDA"
  | "SEM_ENTRADA"
  | "SOBREPOSICAO";

function shiftWindow(shift: ShiftOccurrence): { start: DateTime; end: DateTime } {
  const start = DateTime.fromISO(`${shift.workDate}T${shift.startTime}`, { zone: REPORT_TIMEZONE });
  const end = DateTime.fromISO(`${shift.workDate}T${shift.endTime}`, { zone: REPORT_TIMEZONE });
  return { start, end };
}

/**
 * Estado atual de um turno. Turnos `cancelled` são sempre `FINALIZADO`
 * (não geram exceções nem entram em "por conferir"/"ausente"/"atraso") —
 * ver RH-01 secção 7, "respeitar turnos cancelados".
 */
export function computeShiftState(shift: ShiftOccurrence, now: DateTime): ShiftState {
  if (shift.attendanceStatus === "cancelled") return "FINALIZADO";

  const hasArrived = shift.actualStartTime != null;
  const hasLeft = shift.actualEndTime != null;
  if (hasArrived && hasLeft) return "FINALIZADO";
  if (hasArrived && !hasLeft) return "PRESENTE";

  const { start, end } = shiftWindow(shift);
  if (now < start) return "AGENDADO";
  if (now <= start.plus({ minutes: LATE_TOLERANCE_MINUTES })) return "EM_TOLERANCIA";
  if (now < end) return "ATRASADO_AGUARDANDO_ENTRADA";
  return "AUSENTE_OPERACIONAL";
}

/**
 * Ocorrências do turno — não "corrigidas" silenciosamente, podem coexistir
 * com qualquer estado (RH-01 secção 6: "Atraso é ocorrência do dia, não
 * necessariamente estado atual").
 */
export function computeShiftExceptions(shift: ShiftOccurrence, now: DateTime): ShiftException[] {
  if (shift.attendanceStatus === "cancelled") return [];
  const exceptions: ShiftException[] = [];
  if (shift.attendanceStatus === "late") exceptions.push("CHEGADA_ATRASADA");
  if (shift.attendanceStatus === "left_early") exceptions.push("SAIDA_ANTECIPADA");

  const { end } = shiftWindow(shift);
  const hasArrived = shift.actualStartTime != null;
  const hasLeft = shift.actualEndTime != null;
  // A check constraint da BD permite actual_end_time preenchido com
  // actual_start_time nulo — representável, por isso vale a pena sinalizar.
  if (!hasArrived && hasLeft) exceptions.push("SEM_ENTRADA");
  if (hasArrived && !hasLeft && now >= end) exceptions.push("SEM_SAIDA");
  return exceptions;
}

/**
 * Precisa de conferência: a janela do turno já terminou e não há
 * conferência completa (sem linha, ou com entrada mas sem saída). Turnos
 * cancelados nunca precisam de conferência.
 */
export function shiftNeedsReview(shift: ShiftOccurrence, now: DateTime): boolean {
  if (shift.attendanceStatus === "cancelled") return false;
  const { end } = shiftWindow(shift);
  if (now < end) return false;
  return shift.actualEndTime == null;
}

export type ReviewPriority = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

/**
 * Prioridade de revisão de um turno "por conferir" — combina o tipo de
 * ocorrência (severidade base) com a antiguidade (quanto mais tempo por
 * conferir, mais urgente). Regra centralizada aqui (nunca no frontend),
 * documentada como simplificação: o mockup da RH-01 não define uma fórmula
 * determinística, só exemplos ilustrativos.
 */
export function assignReviewPriority(shift: ShiftOccurrence, exceptions: ShiftException[], now: DateTime): ReviewPriority {
  const { end } = shiftWindow(shift);
  const hoursOverdue = now.diff(end, "hours").hours;

  let base: ReviewPriority = "BAIXA";
  if (exceptions.includes("SEM_SAIDA") || exceptions.includes("SEM_ENTRADA")) base = "ALTA";
  else if (exceptions.includes("CHEGADA_ATRASADA") || exceptions.includes("SAIDA_ANTECIPADA")) base = "MEDIA";

  if (hoursOverdue >= 24) return base === "BAIXA" ? "MEDIA" : "CRITICA";
  return base;
}

/**
 * Conflitos entre turnos do MESMO colaborador no mesmo dia — duas entradas
 * abertas simultaneamente, ou uma ausência aprovada a coincidir com uma
 * presença registada (RH-01 secção 6: "dados contraditórios não devem ser
 * corrigidos silenciosamente").
 */
export function hasOverlappingOpenAttendance(shifts: ShiftOccurrence[], now: DateTime): boolean {
  const openCount = shifts.filter((s) => computeShiftState(s, now) === "PRESENTE").length;
  return openCount >= 2;
}
