import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { ShiftOccurrence, UnscheduledAttendanceOccurrence } from "../ports/out/shift-attendance-read.port.js";
import type { ActiveLeave } from "../ports/out/leave-read.port.js";
import { shiftWindow } from "./overview-shift-state.service.js";

/**
 * Fase 2 ("Assiduidade, Correções, Ausências e Fecho Mensal") — separa
 * sempre Estado (categoria ampla) de Ocorrência (o problema específico),
 * nunca uma única string (task, secção 8). Reaproveita `shiftWindow` de
 * `overview-shift-state.service.ts` — não duplica a noção de "fim do
 * turno" (turno repartido/noturno).
 */
export type AttendanceState = "REGULAR" | "PRESENTE" | "CONCLUIDO" | "PARCIAL" | "AUSENTE" | "EM_ABERTO" | "CONFLITO";

export type AttendanceOccurrenceKind =
  | "ATRASO"
  | "SEM_ENTRADA"
  | "SEM_SAIDA"
  | "SAIDA_ANTECIPADA"
  | "PRESENCA_SEM_ESCALA"
  | "MARCACAO_DUPLICADA"
  | "PERIODO_NAO_CUMPRIDO"
  /** Extensão além da lista literal da secção 8 — necessária para cobrir a secção 16 ("presença durante ausência gera conflito"), que a task exige mas não nomeia como uma das 7 ocorrências fixas. */
  | "PRESENCA_DURANTE_AUSENCIA"
  | "TURNO_NOTURNO_EM_ABERTO";

export interface AttendancePeriod {
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
}

export interface AttendanceIssue {
  shiftId: string | null;
  attendanceId: string | null;
  employeeId: string;
  workDate: string;
  locationId: string | null;
  endsNextDay: boolean;
  periods: AttendancePeriod[];
  state: AttendanceState;
  occurrences: AttendanceOccurrenceKind[];
  lateMinutes: number | null;
  plannedMinutes: number;
  actualMinutes: number;
}

function minutesBetween(startHm: string, endHm: string, endsNextDay = false): number {
  const [sh, sm] = startHm.split(":").map(Number) as [number, number];
  const [eh, em] = endHm.split(":").map(Number) as [number, number];
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (endsNextDay || mins < 0) mins += 24 * 60;
  return mins;
}

/**
 * Atribui o único par entrada/saída real de um turno repartido ao período
 * correspondente — mesma heurística já usada em "Hoje na operação"
 * (`describeSituation`): só há 1 marcação de entrada por turno na BD
 * atual; se cair depois do fim do 1º período, presume-se que é do 2º.
 * Limitação conhecida e aceite: com só 1 par entrada/saída por turno, um
 * turno repartido nunca é representável como "os 2 períodos genuinamente
 * cumpridos" — há sempre, no mínimo, 1 período sem marcação própria do
 * ponto de vista desta função. Corrigir isto exigiria guardar 2 pares
 * entrada/saída por turno (mudança de esquema fora do escopo desta fase).
 */
export function attributeActualToPeriods(shift: ShiftOccurrence): AttendancePeriod[] {
  const isSplit = shift.secondStartTime != null && shift.secondEndTime != null;
  if (!isSplit) {
    return [{ plannedStart: shift.startTime, plannedEnd: shift.endTime, actualStart: shift.actualStartTime, actualEnd: shift.actualEndTime }];
  }
  const missedFirst = shift.actualStartTime != null && shift.actualStartTime >= shift.endTime;
  if (missedFirst) {
    return [
      { plannedStart: shift.startTime, plannedEnd: shift.endTime, actualStart: null, actualEnd: null },
      { plannedStart: shift.secondStartTime, plannedEnd: shift.secondEndTime, actualStart: shift.actualStartTime, actualEnd: shift.actualEndTime },
    ];
  }
  return [
    { plannedStart: shift.startTime, plannedEnd: shift.endTime, actualStart: shift.actualStartTime, actualEnd: shift.actualEndTime },
    { plannedStart: shift.secondStartTime, plannedEnd: shift.secondEndTime, actualStart: null, actualEnd: null },
  ];
}

export function sumPlannedMinutes(periods: AttendancePeriod[], endsNextDay: boolean): number {
  let total = 0;
  for (const p of periods) if (p.plannedStart && p.plannedEnd) total += minutesBetween(p.plannedStart, p.plannedEnd, endsNextDay);
  return total;
}

export function sumActualMinutes(periods: AttendancePeriod[], endsNextDay: boolean): number {
  let total = 0;
  for (const p of periods) if (p.actualStart && p.actualEnd) total += minutesBetween(p.actualStart, p.actualEnd, endsNextDay);
  return total;
}

function buildIssue(
  shift: ShiftOccurrence,
  periods: AttendancePeriod[],
  state: AttendanceState,
  occurrences: AttendanceOccurrenceKind[],
): AttendanceIssue {
  return {
    shiftId: shift.shiftId,
    attendanceId: shift.attendanceId ?? null,
    employeeId: shift.employeeId,
    workDate: shift.workDate,
    locationId: shift.locationId,
    endsNextDay: shift.endsNextDay,
    periods,
    state,
    occurrences,
    lateMinutes: shift.lateMinutes,
    plannedMinutes: sumPlannedMinutes(periods, shift.endsNextDay),
    actualMinutes: sumActualMinutes(periods, shift.endsNextDay),
  };
}

/**
 * Ocorrência (ou `null` = "Regular", nunca aparece na Conferência — task
 * secção 4: "turnos normais não devem gerar trabalho manual
 * desnecessário"). `hasOverlap` vem de `hasOverlappingOpenAttendance`
 * (reaproveitado, não recalculado aqui); `activeLeave` vem de
 * `LeaveReadPort.findActiveOnDate` para este colaborador+dia.
 */
export function computeAttendanceIssue(
  shift: ShiftOccurrence,
  now: DateTime,
  opts: { hasOverlap: boolean; activeLeave: ActiveLeave | null },
): AttendanceIssue | null {
  if (shift.attendanceStatus === "cancelled") return null;

  const periods = attributeActualToPeriods(shift);
  const isSplit = periods.length === 2;
  const hasArrived = shift.actualStartTime != null;
  const hasLeft = shift.actualEndTime != null;
  const { end } = shiftWindow(shift);

  const baseOccurrences: AttendanceOccurrenceKind[] = [];
  if (shift.attendanceStatus === "late") baseOccurrences.push("ATRASO");
  if (shift.attendanceStatus === "left_early") baseOccurrences.push("SAIDA_ANTECIPADA");

  // Ausência válida cobre o turno inteiro e ninguém apareceu — nunca gerar "Sem entrada" falso (secção 16).
  if (opts.activeLeave && !hasArrived) return null;

  // Presença registada apesar de uma ausência válida no mesmo dia — conflito para análise do gestor (secção 16).
  if (opts.activeLeave && hasArrived) {
    return buildIssue(shift, periods, "CONFLITO", [...baseOccurrences, "PRESENCA_DURANTE_AUSENCIA"]);
  }

  // Duas presenças abertas em simultâneo do mesmo colaborador (já detetado por hasOverlappingOpenAttendance).
  if (opts.hasOverlap) {
    return buildIssue(shift, periods, "CONFLITO", [...baseOccurrences, "MARCACAO_DUPLICADA"]);
  }

  // Saída sem entrada (representável pela BD) — sempre conflito, independente da hora atual.
  if (!hasArrived && hasLeft) {
    return buildIssue(shift, periods, "CONFLITO", [...baseOccurrences, "SEM_ENTRADA"]);
  }

  if (hasArrived && hasLeft) {
    const occurrences = [...baseOccurrences];
    if (isSplit && periods.some((p) => p.plannedStart != null && p.actualStart == null)) occurrences.push("PERIODO_NAO_CUMPRIDO");
    if (occurrences.length === 0) return null; // Regular
    return buildIssue(shift, periods, "CONCLUIDO", occurrences);
  }

  if (hasArrived && !hasLeft) {
    if (now >= end) {
      if (shift.endsNextDay) return buildIssue(shift, periods, "CONFLITO", [...baseOccurrences, "TURNO_NOTURNO_EM_ABERTO"]);
      return buildIssue(shift, periods, "EM_ABERTO", [...baseOccurrences, "SEM_SAIDA"]);
    }
    const occurrences = [...baseOccurrences];
    if (isSplit) {
      if (periods[0]!.plannedStart != null && periods[0]!.actualStart == null) {
        // Chegou (a marcação única foi atribuída ao 2º período) mas nunca apareceu para o 1º.
        occurrences.push("PERIODO_NAO_CUMPRIDO");
      } else {
        // 1º período cumprido; só sinaliza o 2º em falta depois de a hora dele já ter chegado (antes disso é intervalo normal, não pendência).
        const period2 = periods[1]!;
        const period2Start = period2.plannedStart
          ? DateTime.fromISO(`${shift.workDate}T${period2.plannedStart}`, { zone: REPORT_TIMEZONE })
          : null;
        if (period2.plannedStart != null && period2.actualStart == null && period2Start && now >= period2Start) {
          occurrences.push("PERIODO_NAO_CUMPRIDO");
        }
      }
    }
    if (occurrences.length === 0) return null; // presente, sem anomalia — ainda não é pendência
    return buildIssue(shift, periods, isSplit ? "PARCIAL" : "PRESENTE", occurrences);
  }

  // Nunca chegou — só é pendência depois de a janela terminar (antes disso é "agendado"/"em tolerância", fora do escopo da Conferência).
  if (now >= end) return buildIssue(shift, periods, "AUSENTE", [...baseOccurrences, "SEM_ENTRADA"]);
  return null;
}

/** "Presença sem escala" (secção 13) — sempre `Conflito`, nunca formalizada em escala automaticamente. */
export function computeUnscheduledAttendanceIssue(row: UnscheduledAttendanceOccurrence): AttendanceIssue {
  const period: AttendancePeriod = { plannedStart: null, plannedEnd: null, actualStart: row.actualStartTime, actualEnd: row.actualEndTime };
  return {
    shiftId: null,
    attendanceId: row.attendanceId,
    employeeId: row.employeeId,
    workDate: row.workDate,
    locationId: row.locationId,
    endsNextDay: false,
    periods: [period],
    state: "CONFLITO",
    occurrences: ["PRESENCA_SEM_ESCALA"],
    lateMinutes: row.lateMinutes,
    plannedMinutes: 0,
    actualMinutes: row.actualStartTime && row.actualEndTime ? minutesBetween(row.actualStartTime, row.actualEndTime) : 0,
  };
}

/**
 * Rótulo único da coluna "Ocorrência" — mesma ideia de
 * `describeExceptionLabel` (prioriza a ocorrência mais relevante quando há
 * mais de uma), mas com o detalhe de qual período falhou (secção 6).
 */
export function describeAttendanceOccurrence(issue: AttendanceIssue): string {
  const o = issue.occurrences;
  if (o.includes("TURNO_NOTURNO_EM_ABERTO")) return "Turno noturno em aberto";
  if (o.includes("PRESENCA_DURANTE_AUSENCIA")) return "Presença durante ausência";
  if (o.includes("PRESENCA_SEM_ESCALA")) return "Presença sem escala";
  if (o.includes("MARCACAO_DUPLICADA")) return "Marcação duplicada";
  if (o.includes("PERIODO_NAO_CUMPRIDO")) {
    const missingIndex = issue.periods.findIndex((p) => p.plannedStart != null && p.actualStart == null);
    if (missingIndex === 0) return "1º período sem entrada";
    if (missingIndex === 1) return "2º período sem entrada";
    return "Período não cumprido";
  }
  if (o.includes("SEM_SAIDA")) return "Sem saída";
  if (o.includes("SEM_ENTRADA")) return "Sem entrada";
  if (o.includes("SAIDA_ANTECIPADA")) return "Saída antecipada";
  if (o.includes("ATRASO")) return `Atraso${issue.lateMinutes != null ? ` ${issue.lateMinutes} min` : ""}`;
  return "Por conferir";
}
