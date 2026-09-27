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

/**
 * Janela real do turno — do início do 1º período ao fim do ÚLTIMO período
 * (2º período de um turno repartido, quando existe), com +1 dia quando
 * `endsNextDay` (turno noturno — nunca combinado com 2º período, regra V1
 * de `WorkShift`). Antes da task "Hoje na operação melhorado" isto usava só
 * `shift.endTime` (fim do 1º período), o que classificava incorretamente um
 * turno repartido como "ausente" já durante o intervalo previsto, e um
 * turno noturno como encerrado antes mesmo de começar (end < start no
 * mesmo dia civil). Usado por todas as funções deste ficheiro — corrige-as
 * a todas de uma vez, sem duplicar a noção de "fim do turno".
 */
export function shiftWindow(shift: ShiftOccurrence): { start: DateTime; end: DateTime } {
  const start = DateTime.fromISO(`${shift.workDate}T${shift.startTime}`, { zone: REPORT_TIMEZONE });
  const lastSegmentEndTime = shift.secondEndTime ?? shift.endTime;
  let end = DateTime.fromISO(`${shift.workDate}T${lastSegmentEndTime}`, { zone: REPORT_TIMEZONE });
  if (shift.endsNextDay) end = end.plus({ days: 1 });
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

// ── "Hoje na operação" (Visão Geral) ────────────────────────────────────────
// Task "Melhorar Hoje na operação": separa Estado (curto, uma palavra) de
// Situação (texto contextual) e mostra o horário real do turno, incluindo
// repartido/noturno. `CONFLITO`/`FERIAS`/`BAIXA`/`FOLGA` não são produzidos
// aqui (dependem de comparar vários turnos, ou de ausências — ver o use
// case), só a parte que depende de UM turno.

export type OperationDisplayState = "AGENDADO" | "EM_TOLERANCIA" | "PRESENTE" | "ATRASADO" | "FINALIZADO" | "AUSENTE" | "INTERVALO";

const DISPLAY_STATE_BY_SHIFT_STATE: Record<ShiftState, OperationDisplayState> = {
  AGENDADO: "AGENDADO",
  EM_TOLERANCIA: "EM_TOLERANCIA",
  PRESENTE: "PRESENTE",
  ATRASADO_AGUARDANDO_ENTRADA: "ATRASADO",
  FINALIZADO: "FINALIZADO",
  AUSENTE_OPERACIONAL: "AUSENTE",
};

/**
 * Estado de exibição de um turno — mesmos nomes pedidos pela task ("Estado
 * ≠ Situação"). Sobrepõe `INTERVALO`/`AUSENTE` quando o turno é repartido e
 * `now` cai no intervalo entre o 1º e o 2º período:
 * - já houve entrada (`actualStartTime` preenchido, presume-se que foi para
 *   o 1º período, já que só há 1 marcação de entrada por turno) → `INTERVALO`
 *   ("Melhorar Hoje na operação — refinado", secção 7: "1º período
 *   cumprido + 2º ainda não começou").
 * - nunca houve entrada → `AUSENTE`, não `ATRASADO`/`INTERVALO` (secção 7:
 *   "1º período sem entrada e 2º ainda não começou" — antes desta correção,
 *   qualquer turno repartido no intervalo mostrava sempre `INTERVALO`,
 *   mesmo sem ninguém ter aparecido para o 1º período).
 */
export function computeOperationDisplayState(shift: ShiftOccurrence, now: DateTime): OperationDisplayState {
  const display = DISPLAY_STATE_BY_SHIFT_STATE[computeShiftState(shift, now)];
  if (display === "FINALIZADO") return display;
  if (shift.secondStartTime && shift.secondEndTime) {
    const seg1End = DateTime.fromISO(`${shift.workDate}T${shift.endTime}`, { zone: REPORT_TIMEZONE });
    const seg2Start = DateTime.fromISO(`${shift.workDate}T${shift.secondStartTime}`, { zone: REPORT_TIMEZONE });
    if (now >= seg1End && now < seg2Start) return shift.actualStartTime != null ? "INTERVALO" : "AUSENTE";
  }
  return display;
}

export interface SituationDescription {
  /** Linha principal. */
  situation: string;
  /** Linha secundária de alerta (`⚠ …`, sem o próprio símbolo — o frontend decide como desenhar) — null quando não há inconsistência a sinalizar. */
  situationWarning: string | null;
}

/**
 * Texto contextual da coluna "Situação" — nunca repete o que "Estado" já diz
 * (RH — Hoje na operação, secção 2/6). `displayState` deve vir de
 * `computeOperationDisplayState` para o mesmo turno/instante. Devolve
 * também uma linha secundária opcional (`situationWarning`) para
 * inconsistências que devem continuar visíveis mesmo quando já não afetam o
 * Estado atual — ex: "1º turno sem entrada" continua visível mesmo depois
 * de o colaborador entrar no 2º período e o Estado passar a `PRESENTE`
 * ("Melhorar Hoje na operação — refinado", secção 6: "não mostrar Lucas
 * como Atrasado apenas porque perdeu o primeiro período... a inconsistência
 * anterior deve continuar visível").
 */
export function describeSituation(shift: ShiftOccurrence, displayState: OperationDisplayState, now: DateTime): SituationDescription {
  const isSplit = shift.secondStartTime != null && shift.secondEndTime != null;
  const seg2Start = isSplit ? DateTime.fromISO(`${shift.workDate}T${shift.secondStartTime}`, { zone: REPORT_TIMEZONE }) : null;

  switch (displayState) {
    case "AGENDADO":
      return { situation: `Inicia às ${shift.startTime}`, situationWarning: null };
    case "EM_TOLERANCIA":
      return { situation: "Sem entrada", situationWarning: null };
    case "ATRASADO":
      // Turno repartido: distingue "ainda dentro do 1º período" de "já dentro do 2º, sem entrada" (secção 7, "2º período começou e funcionário ainda não entrou").
      if (seg2Start && now >= seg2Start) return { situation: "Sem entrada no 2º turno", situationWarning: null };
      return { situation: "Sem entrada", situationWarning: null };
    case "AUSENTE":
      // Só chega aqui com now < seg2Start quando `computeOperationDisplayState` sobrepôs AUSENTE no intervalo entre períodos (nunca compareceu ao 1º) — secção 7, "1º período sem entrada e 2º ainda não começou".
      if (seg2Start && now < seg2Start) {
        return { situation: `1º turno sem entrada · Próximo às ${shift.secondStartTime}`, situationWarning: null };
      }
      return { situation: "Sem entrada", situationWarning: null };
    case "INTERVALO":
      return { situation: `Regresso previsto ${shift.secondStartTime}`, situationWarning: null };
    case "PRESENTE": {
      // Entrou, mas só depois do 1º período já ter terminado — presume-se que faltou ao 1º e só apareceu para o 2º (secção 6/7, caso Lucas Almeida). Comparação de strings "HH:mm" é segura aqui (mesmo dia civil, turno repartido nunca combinado com `endsNextDay`).
      const missedFirst = isSplit && shift.actualStartTime != null && shift.actualStartTime >= shift.endTime;
      const situationWarning = missedFirst ? "1º turno sem entrada" : null;
      if (shiftNeedsReview(shift, now)) return { situation: "Sem saída", situationWarning };
      const late = shift.attendanceStatus === "late" && shift.lateMinutes != null;
      const situation = late ? `Entrada ${shift.actualStartTime} · atraso ${shift.lateMinutes} min` : `Entrada ${shift.actualStartTime}`;
      return { situation, situationWarning };
    }
    case "FINALIZADO":
      if (shift.attendanceStatus === "cancelled") return { situation: "Turno cancelado", situationWarning: null };
      return { situation: shift.actualEndTime ? `Saída ${shift.actualEndTime}` : "Turno concluído", situationWarning: null };
    default:
      return { situation: "—", situationWarning: null };
  }
}

/**
 * Horário do turno de hoje, em 1 ou 2 partes (turno repartido) — nunca uma
 * única string pré-formatada, para o frontend poder desenhar cada período
 * numa linha própria (RH — Hoje na operação, secção 5).
 */
export function describeShiftSchedule(shift: ShiftOccurrence): string[] {
  const first = shift.endsNextDay ? `${shift.startTime}–${shift.endTime} (+1 dia)` : `${shift.startTime}–${shift.endTime}`;
  if (shift.secondStartTime && shift.secondEndTime) return [first, `${shift.secondStartTime}–${shift.secondEndTime}`];
  return [first];
}

/**
 * Rótulo da exceção de um turno "por conferir" — usado por
 * `ListShiftsToReviewUseCase` e `GetShiftToReviewUseCase` (mesma regra,
 * nunca duplicada entre os dois).
 */
export function describeExceptionLabel(exceptions: ShiftException[], lateMinutes: number | null): string {
  if (exceptions.includes("SEM_SAIDA")) return "Sem saída";
  if (exceptions.includes("SEM_ENTRADA")) return "Sem entrada";
  if (exceptions.includes("CHEGADA_ATRASADA")) return `Atraso${lateMinutes != null ? ` +${lateMinutes} min` : ""}`;
  if (exceptions.includes("SAIDA_ANTECIPADA")) return "Saída antecipada";
  return "Por conferir";
}
