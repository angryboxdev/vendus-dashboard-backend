import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { AttendancePeriod } from "./attendance-conference.service.js";
import type { AttendanceRulesValues, AttendanceRulesVersion } from "../entities/attendance-rules.js";
import { DEFAULT_ATTENDANCE_RULES } from "../entities/attendance-rules.js";
import { clockDiffMinutes, hmToMinutes } from "./shift-clock.service.js";

/**
 * Fase 2.1 — classificação automática por tolerância, em PARALELO à
 * classificação manual existente (`computeAttendanceIssue`, baseada em
 * `attendanceStatus` gravado pelo gestor). Nunca lê/escreve
 * `attendanceStatus` — trabalha só a partir dos horários brutos
 * (planeado vs. registado) + regras configuráveis. `conflict` e
 * `unscheduled_presence` nunca são decididos aqui — continuam exclusivos
 * das branches já existentes em `attendance-conference.service.ts`,
 * sobrepostos por cima do resultado deste ficheiro pelo use case.
 */
export type ToleranceOccurrenceKind =
  | "late_entry"
  | "early_exit"
  | "no_entry"
  | "no_exit"
  | "absence"
  | "before_window"
  | "incomplete_period"
  | "ok";

export interface ToleranceClassification {
  kind: ToleranceOccurrenceKind;
  diffMinutes: number | null;
}

/** Mais grave primeiro — usada para reduzir vários resultados (entrada+saída, vários períodos) a 1 só. */
const SEVERITY_ORDER: ToleranceOccurrenceKind[] = ["absence", "no_exit", "no_entry", "late_entry", "early_exit", "before_window", "ok"];

/** Kinds "de marcação em falta" — usados para detetar período incompleto num turno repartido. */
const MISSING_KINDS: ToleranceOccurrenceKind[] = ["no_entry", "absence", "no_exit"];

function pickMostSevere(results: ToleranceClassification[]): ToleranceClassification {
  for (const kind of SEVERITY_ORDER) {
    const found = results.find((r) => r.kind === kind);
    if (found) return found;
  }
  return { kind: "ok", diffMinutes: null };
}

/**
 * Diferença real em minutos (registado − planeado) — nunca só "o que excedeu
 * a tolerância" (task, secção 2). A marcação vai para o dia mais próximo da
 * hora planeada (`shift-clock.service`): 00:10 num turno das 23:50 = +20.
 */
function diffMinutes(actualHm: string, plannedHm: string, plannedNextDay = false): number {
  return clockDiffMinutes(actualHm, hmToMinutes(plannedHm) + (plannedNextDay ? 24 * 60 : 0));
}

function instantOf(workDate: string, hm: string, addDays = 0): DateTime {
  const base = DateTime.fromISO(`${workDate}T${hm}`, { zone: REPORT_TIMEZONE });
  return addDays > 0 ? base.plus({ days: addDays }) : base;
}

function classifyEntry(period: AttendancePeriod, workDate: string, rules: AttendanceRulesValues, now: DateTime): ToleranceClassification {
  if (!period.plannedStart) return { kind: "ok", diffMinutes: null };

  if (!period.actualStart) {
    const startInstant = instantOf(workDate, period.plannedStart);
    if (now < startInstant) return { kind: "ok", diffMinutes: null }; // ainda não chegou a hora de início — nada a reportar
    const thresholdInstant = startInstant.plus({ minutes: rules.absenceThresholdMinutes });
    if (now >= thresholdInstant) return { kind: "absence", diffMinutes: null };
    return { kind: "no_entry", diffMinutes: null };
  }

  const diff = diffMinutes(period.actualStart, period.plannedStart);
  if (diff < -rules.preShiftWindowMinutes) return { kind: "before_window", diffMinutes: diff };
  if (diff > rules.entryToleranceMinutes) return { kind: "late_entry", diffMinutes: diff };
  return { kind: "ok", diffMinutes: diff };
}

function classifyExit(
  period: AttendancePeriod,
  workDate: string,
  periodEndsNextDay: boolean,
  rules: AttendanceRulesValues,
  now: DateTime,
): ToleranceClassification {
  if (!period.plannedEnd) return { kind: "ok", diffMinutes: null };

  if (!period.actualEnd) {
    // Sem entrada também → o problema é de entrada, não de saída (evita duplicar a mesma pendência 2x).
    if (!period.actualStart) return { kind: "ok", diffMinutes: null };
    const endInstant = instantOf(workDate, period.plannedEnd, periodEndsNextDay ? 1 : 0);
    if (now < endInstant) return { kind: "ok", diffMinutes: null }; // turno ainda a decorrer, normal não haver saída
    return { kind: "no_exit", diffMinutes: null };
  }

  const diff = diffMinutes(period.actualEnd, period.plannedEnd, periodEndsNextDay);
  if (diff < -rules.earlyExitToleranceMinutes) return { kind: "early_exit", diffMinutes: diff };
  return { kind: "ok", diffMinutes: diff };
}

/**
 * Classifica um turno (1 ou 2 períodos) segundo as regras de tolerância
 * vigentes. Aplica a regra a cada período separadamente (task, secção 5)
 * e reduz ao resultado mais grave. `periods`/`endsNextDay` seguem
 * exatamente a mesma forma já usada por `attendance-conference.service.ts`
 * (`attributeActualToPeriods`) — nunca recalcula a atribuição real→período,
 * só reaproveita. Turnos anteriores a `rules.controlStartDate` nunca são
 * classificados automaticamente (task "Assiduidade — Conferência, Por
 * Colaborador e Horas & Saldos", secção 11) — só suprime a deteção
 * automática, o sinal manual (`computeAttendanceIssue`) é independente
 * disto e continua a aparecer normalmente.
 */
export function classifyByTolerance(
  periods: AttendancePeriod[],
  workDate: string,
  endsNextDay: boolean,
  rules: AttendanceRulesValues,
  now: DateTime,
): ToleranceClassification {
  if (rules.controlStartDate && workDate < rules.controlStartDate) {
    return { kind: "ok", diffMinutes: null };
  }

  if (periods.length === 2) {
    const [period1, period2] = periods as [AttendancePeriod, AttendancePeriod];
    const entry1 = classifyEntry(period1, workDate, rules, now);
    const exit1 = classifyExit(period1, workDate, false, rules, now);
    const entry2 = classifyEntry(period2, workDate, rules, now);
    const exit2 = classifyExit(period2, workDate, endsNextDay, rules, now);

    // Turno repartido nunca é noturno em simultâneo (V1, ver README) — `endsNextDay` só se aplica ao 2º período.
    const period1Ok = entry1.kind === "ok" && exit1.kind === "ok";
    const period2Ok = entry2.kind === "ok" && exit2.kind === "ok";
    const period1Missing = MISSING_KINDS.includes(entry1.kind) || MISSING_KINDS.includes(exit1.kind);
    const period2Missing = MISSING_KINDS.includes(entry2.kind) || MISSING_KINDS.includes(exit2.kind);

    // 1 período cumprido, o outro com marcação em falta → "período incompleto" (mockup, exemplo Lucas Almeida) —
    // mais informativo do que expor o problema do período isolado como se fosse do turno inteiro.
    if (period1Ok && period2Missing) return { kind: "incomplete_period", diffMinutes: null };
    if (period2Ok && period1Missing) return { kind: "incomplete_period", diffMinutes: null };

    return pickMostSevere([entry1, exit1, entry2, exit2]);
  }

  const [period] = periods as [AttendancePeriod];
  return pickMostSevere([classifyEntry(period, workDate, rules, now), classifyExit(period, workDate, endsNextDay, rules, now)]);
}

export function describeToleranceOccurrence(kind: ToleranceOccurrenceKind, diff: number | null): string {
  switch (kind) {
    case "late_entry":
      return `Atraso na entrada${diff != null ? ` (${diff} min)` : ""}`;
    case "early_exit":
      return `Saída antecipada${diff != null ? ` (${Math.abs(diff)} min)` : ""}`;
    case "no_entry":
      return "Sem entrada";
    case "no_exit":
      return "Sem saída";
    case "absence":
      return "Ausência (sem entrada)";
    case "before_window":
      return "Marcação antes da janela permitida";
    case "incomplete_period":
      return "Turno/período incompleto";
    case "ok":
      return "OK (dentro da tolerância)";
  }
}

/**
 * Escolhe a versão vigente para uma data: a de `effectiveFrom` mais
 * recente que ainda seja `<= forDate` (empate por `createdAt` desc). Sem
 * nenhuma versão criada ainda, devolve o default — nunca bloqueia a
 * Conferência à espera de configuração (task, secção 2). Como o
 * frontend só permite `effectiveFrom = hoje` ao criar uma versão (nunca
 * retroativo), um período já decorrido nunca é reclassificado por uma
 * alteração posterior — não é necessário "congelar" meses fechados à
 * parte.
 */
export function resolveEffectiveRules(versions: AttendanceRulesVersion[], forDate: string): AttendanceRulesValues {
  const candidates = versions.filter((v) => v.effectiveFrom <= forDate);
  if (candidates.length === 0) return DEFAULT_ATTENDANCE_RULES;
  candidates.sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? a.createdAt.localeCompare(b.createdAt) : a.effectiveFrom.localeCompare(b.effectiveFrom)));
  return candidates[candidates.length - 1]!;
}
