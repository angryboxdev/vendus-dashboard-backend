import type { DayReview, ManualTimes, PlannedRange, ReviewDecision } from "../entities/day-review.js";
import type { DayResult } from "./day-engine.js";

/**
 * Regras puras da conferência V2 (ADR-0043). O motor (`computeDays`) continua
 * a ser a única fonte do cálculo; aqui decide-se o estado de conferência de um
 * dia, o que cada decisão pode fazer (com o motivo quando não pode) e como uma
 * decisão gravada entra no resultado do motor. Nada inventa horas: "cumpriu"
 * usa o teórico do planeado publicado, "manter" o calculado e a ausência
 * nunca gera trabalho.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isHhmm = (v: unknown): v is string => typeof v === "string" && HHMM.test(v);
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Duração de uma faixa em segundos; fim ≤ início = passa a meia-noite. */
export const rangeSeconds = (r: PlannedRange) => {
  const d = toMin(r.end) - toMin(r.start);
  return (d <= 0 ? d + 1440 : d) * 60;
};

/** Correção manual: entrada → saída, menos a pausa não paga. */
export const manualSeconds = (m: ManualTimes) => Math.max(0, rangeSeconds(m) - m.breakMinutes * 60);

/**
 * A decisão ativa entra no resultado do motor: "cumpriu"/"corrigir" fixam o
 * trabalhado no validado; todas dão o dia por revisto (sem incidentes abertos).
 * As picagens e os segmentos não mudam.
 */
export function applyReview(day: DayResult, review: DayReview | undefined): DayResult {
  if (!review) return day;
  if (review.validatedSeconds === null) return { ...day, incidents: [] };
  return { ...day, workedSeconds: review.validatedSeconds, excessSeconds: review.validatedSeconds - day.theoreticalSeconds, pendingSeconds: 0, incidents: [] };
}

export type ReviewState = "ok" | "review" | "late" | "absent" | "justified" | "in_progress" | "day_off" | "no_schedule" | "future" | "reviewed";

export type ReviewExclusion =
  | "closed"
  | "in_progress"
  | "future"
  | "day_off"
  | "absence"
  | "no_schedule"
  | "schedule_exception"
  | "no_punches"
  | "single_punch"
  | "overtime"
  | "has_work"
  | "already_ok"
  | "already_reviewed"
  | "batch_manual"
  | "self"
  | "changed";

export type ReviewBucket = "apply" | "already" | "excluded" | "individual";

/** O que é preciso saber de um dia (já apurado pelo motor, antes da decisão). */
export interface ReviewFacts {
  workDate: string;
  phase: "done" | "in_progress" | "future";
  closed: boolean;
  theoreticalSeconds: number;
  /** Planeado publicado do dia (null = sem faixas). */
  plannedRanges: PlannedRange[] | null;
  restDay: boolean;
  holiday: boolean;
  /** Ausência aprovada (não feriado). */
  excusedAbsence: boolean;
  workedSeconds: number;
  hasPunches: boolean;
  /** Entrada sem saída (registo aberto/esquecido). */
  incomplete: boolean;
  lateMinutes: number;
  review: DayReview | null;
  toleranceMinutes: number;
}

export function reviewState(f: ReviewFacts): ReviewState {
  if (f.review) return "reviewed";
  if (f.excusedAbsence) return "justified";
  if ((f.restDay || f.holiday) && f.theoreticalSeconds === 0 && !f.hasPunches) return "day_off";
  if (f.phase === "future") return "future";
  if (f.theoreticalSeconds === 0) return f.hasPunches && (f.restDay || f.holiday) ? "review" : "no_schedule";
  if (f.phase === "in_progress") return "in_progress";
  if (!f.hasPunches) return "absent";
  if (f.incomplete) return "review";
  if (f.lateMinutes > f.toleranceMinutes) return "late";
  if (Math.abs(f.workedSeconds - f.theoreticalSeconds) > f.toleranceMinutes * 60) return "review";
  return "ok";
}

export interface Classified {
  bucket: ReviewBucket;
  reason?: ReviewExclusion;
  before: number;
  /** Segundos validados depois da decisão (só faz sentido em "apply"). */
  after: number;
}

/**
 * O que uma decisão faz a um dia. `batch` = mais de um dia em causa: os casos
 * que exigem olhar para o dia (sem picagens, picagem única, correção manual,
 * ausência com trabalho registado) vão para "revisão individual".
 */
export function classifyReview(f: ReviewFacts, decision: ReviewDecision, batch: boolean, manual: ManualTimes | null = null): Classified {
  const out = (bucket: ReviewBucket, reason?: ReviewExclusion, after = f.workedSeconds): Classified => ({ bucket, ...(reason && { reason }), before: f.workedSeconds, after });
  if (f.review) return out("already", "already_reviewed");
  if (f.closed) return out("excluded", "closed");
  const noPlan = f.theoreticalSeconds === 0;
  if (noPlan && (f.restDay || f.holiday) && !f.hasPunches) return out("excluded", "day_off");
  if (f.phase === "in_progress") return out("excluded", "in_progress");
  if (f.phase === "future") return out("excluded", "future");
  const state = reviewState(f);

  if (decision === "absence") {
    // Ausência já registada (ex.: acabada de atribuir nas Ausências): a decisão confirma-a, mesmo com o teórico a zero.
    if (f.excusedAbsence) return out("apply");
    if (noPlan) return out("excluded", f.restDay || f.holiday ? "day_off" : "no_schedule");
    if (f.workedSeconds > 0 && batch) return out("individual", "has_work");
    return out("apply");
  }
  if (f.excusedAbsence) return out("excluded", "absence");
  if (noPlan) return out("excluded", f.hasPunches ? "schedule_exception" : f.restDay || f.holiday ? "day_off" : "no_schedule");
  if (decision === "manual") return batch ? out("individual", "batch_manual") : out("apply", undefined, manual ? manualSeconds(manual) : f.workedSeconds);
  if (decision === "keep") return state === "ok" ? out("already", "already_ok") : out("apply");

  // Cumpriu o horário planeado: o validado é o teórico do planeado (segmentos e pausas do planeamento).
  if (state === "ok") return out("already", "already_ok");
  if (f.workedSeconds > f.theoreticalSeconds + f.toleranceMinutes * 60) return out("excluded", "overtime");
  if (!f.hasPunches) return batch ? out("individual", "no_punches") : out("apply", undefined, f.theoreticalSeconds);
  if (f.incomplete && batch) return out("individual", "single_punch");
  return out("apply", undefined, f.theoreticalSeconds);
}

/** Motivo legível de uma exclusão (resumo do lote e mensagens). */
export const EXCLUSION_LABEL: Record<ReviewExclusion, string> = {
  closed: "Período fechado",
  in_progress: "Turno ainda em curso",
  future: "Dia futuro",
  day_off: "Folga ou feriado",
  absence: "Ausência aprovada",
  no_schedule: "Sem escala publicada",
  schedule_exception: "Trabalho sem escala publicada — resolver no planeamento",
  no_punches: "Sem picagens — confirmar trabalho dia a dia",
  single_punch: "Só uma picagem — rever o dia",
  overtime: "Trabalhou além do planeado — horas reais preservadas",
  has_work: "Tem trabalho registado — rever o dia",
  already_ok: "Já conforme",
  already_reviewed: "Já revisto",
  batch_manual: "A correção manual é feita dia a dia",
  self: "Não pode conferir o seu próprio registo",
  changed: "O dia mudou entretanto — recarregue",
};
