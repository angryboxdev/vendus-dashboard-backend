import { DateTime } from "luxon";
import type { EffectiveEvent, SegmentType } from "../entities/clock.js";

/**
 * Motor de apuramento diário (Eng. Reversa 3.4; RE-5..RE-8, RE-14; D8).
 * Puro: recebe as marcações em vigor e as regras; devolve, por dia de
 * trabalho (no fuso do centro), os totais e os incidentes. É a ÚNICA fonte
 * dos totais — todas as vistas leem daqui (corrige a inconsistência RE-6).
 */

export interface Segment {
  start: string;
  end: string;
  type: Exclude<SegmentType, "off">;
  /** Registo ainda aberto (sem saída) — fecha em `now` para cálculo. */
  open: boolean;
  /** Fechado automaticamente (registo esquecido). */
  autoClosed: boolean;
  /** Registo esquecido (aberto há mais de `maxOpenHours`) — horas pendentes até validação (D8). */
  forgotten?: boolean;
  /** FE-103: tipo de pausa do catálogo. */
  breakTypeId?: string | null;
}

export interface DayPlan {
  /** Minutos teóricos (módulo time-base). */
  theoreticalMinutes: number;
  /** Primeira hora planeada "HH:MM" (horário fixo), para atrasos. */
  plannedStart: string | null;
  /** Fim planeado "HH:MM" e se termina no dia seguinte (horário noturno). */
  plannedEnd: string | null;
  nightSchedule: boolean;
  /** Feriado confirmado ou ausência registada → não há falta. */
  excused: boolean;
  /** D8: a gestão validou o incidente deste dia → as horas pendentes contam. */
  incidentValidated?: boolean;
  /** CF-7: ausência "conta como trabalhado" — segundos somados ao trabalhado. */
  creditSeconds?: number;
}

export interface EngineRules {
  timeZone: string;
  nightRule: "night_schedule_only" | "continuity_margin";
  continuityMinutes: number | null;
  toleranceMinutes: number;
  roundingMinutes: number;
  autoClose: boolean;
  /** Um registo aberto há mais do que isto é considerado esquecido (configurável). */
  maxOpenHours: number;
  /** D8: horas de incidentes (registo fechado automaticamente) contam já como trabalho? */
  incidentHoursCount: boolean;
  /** Janela noturna legal (HH:MM); null = sem cálculo de noturno (D6). */
  nightStart: string | null;
  nightEnd: string | null;
  /** FE-103: regras do catálogo de pausas por id (pausas com tipo). */
  breakTypes?: Record<string, BreakRule>;
}

/** Remuneração de um tipo de pausa: paga, não paga ou híbrida (primeiros N minutos do dia pagos); o que passar da duração máxima não é pago. */
export interface BreakRule {
  remuneration: "paid" | "unpaid" | "hybrid";
  hybridPaidMinutes: number | null;
  maxMinutes: number | null;
}

export type IncidentType = "missing_in" | "missing_out" | "auto_closed" | "late";

export interface DayResult {
  workDate: string;
  workedSeconds: number;
  breakSeconds: number;
  nightSeconds: number;
  theoreticalSeconds: number;
  excessSeconds: number;
  /** Segundos de incidentes ainda não validados (D8: não contam). */
  pendingSeconds: number;
  segments: Segment[];
  incidents: IncidentType[];
}

const WORKING: Segment["type"][] = ["work", "remote", "break_paid"];
const secs = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));
const local = (iso: string, tz: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz);

/** Segmentos entre marcações consecutivas; `off` fecha. Um aberto termina em `now` (ou é fechado automaticamente). */
export function buildSegments(events: EffectiveEvent[], now: string): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.segmentType === "off") continue;
    const next = events[i + 1];
    out.push({ start: e.occurredAt, end: next ? next.occurredAt : now < e.occurredAt ? e.occurredAt : now, type: e.segmentType, open: !next, autoClosed: false, ...(e.breakTypeId ? { breakTypeId: e.breakTypeId } : {}) });
  }
  return out;
}

/** Instante UTC de "HH:MM" local numa data (com +1 dia opcional). */
const at = (date: string, hhmm: string, tz: string, plusDays = 0) => DateTime.fromISO(`${date}T${hhmm}`, { zone: tz }).plus({ days: plusDays }).toUTC().toISO()!;

/**
 * Atribui cada (pedaço de) segmento a um dia de trabalho:
 * - horário noturno no dia de início: o que cai dentro do turno conta nesse dia (RE-8);
 * - regra "margem de continuidade": um segmento que começa antes da meia-noite conta todo no dia
 *   de início; os seguintes contam no mesmo dia se o intervalo ≤ margem (RE-7);
 * - caso contrário, divide à meia-noite local (RE-6).
 */
export function attribute(segments: Segment[], rules: EngineRules, plans: Map<string, DayPlan>): Map<string, Segment[]> {
  const out = new Map<string, Segment[]>();
  const push = (d: string, s: Segment) => out.set(d, [...(out.get(d) ?? []), s]);
  let lastDay: string | null = null;
  let lastEnd: string | null = null;
  for (const s of segments) {
    const startLocal = local(s.start, rules.timeZone);
    const startDay = startLocal.toISODate()!;
    const prevDay = startLocal.minus({ days: 1 }).toISODate()!;
    const prevPlan = plans.get(prevDay);
    // Turno noturno de ontem ainda em curso (ex.: 02:00 dentro de 22:00–06:00).
    if (prevPlan?.nightSchedule && prevPlan.plannedEnd && s.start < at(prevDay, prevPlan.plannedEnd, rules.timeZone, 1)) {
      push(prevDay, s);
      lastDay = prevDay;
      lastEnd = s.end;
      continue;
    }
    const plan = plans.get(startDay);
    const nextMidnight = startLocal.plus({ days: 1 }).startOf("day").toUTC().toISO()!;
    const crosses = s.end > nextMidnight;
    if (
      rules.nightRule === "continuity_margin" &&
      rules.continuityMinutes !== null &&
      lastDay === prevDay &&
      lastEnd !== null &&
      secs(lastEnd, s.start) <= rules.continuityMinutes * 60
    ) {
      push(prevDay, s);
      lastEnd = s.end;
      continue;
    }
    if (!crosses || plan?.nightSchedule || rules.nightRule === "continuity_margin") {
      push(startDay, s);
      lastDay = startDay;
      lastEnd = s.end;
      continue;
    }
    // Divide à meia-noite local (pode atravessar mais de uma).
    let cur = s.start;
    while (cur < s.end) {
      const curLocal = local(cur, rules.timeZone);
      const day = curLocal.toISODate()!;
      const midnight = curLocal.plus({ days: 1 }).startOf("day").toUTC().toISO()!;
      const end = s.end < midnight ? s.end : midnight;
      push(day, { ...s, start: cur, end });
      lastDay = day;
      lastEnd = end;
      cur = end;
    }
  }
  return out;
}

function overlapSeconds(a1: string, a2: string, b1: string, b2: string): number {
  const s = a1 > b1 ? a1 : b1;
  const e = a2 < b2 ? a2 : b2;
  return secs(s, e);
}

function nightSeconds(seg: Segment, date: string, rules: EngineRules): number {
  if (!rules.nightStart || !rules.nightEnd) return 0;
  let total = 0;
  for (const d of [-1, 0, 1]) {
    const day = DateTime.fromISO(date).plus({ days: d }).toISODate()!;
    const crosses = rules.nightEnd <= rules.nightStart;
    total += overlapSeconds(seg.start, seg.end, at(day, rules.nightStart, rules.timeZone), at(day, rules.nightEnd, rules.timeZone, crosses ? 1 : 0));
  }
  return total;
}

/**
 * Apura um conjunto de dias. Um registo aberto está "em curso" até `maxOpenHours`;
 * depois é esquecido (fecho automático se ligado, senão incidente).
 */
export function computeDays(events: EffectiveEvent[], dates: string[], plans: Map<string, DayPlan>, rules: EngineRules, now: string): DayResult[] {
  const today = local(now, rules.timeZone).toISODate()!;
  let segments = buildSegments(events, now);
  const forgotten = new Set<string>();
  segments = segments.map((s) => {
    if (!s.open) return s;
    const day = local(s.start, rules.timeZone).toISODate()!;
    if (secs(s.start, now) <= rules.maxOpenHours * 3600) return s;
    forgotten.add(day);
    // Esquecido: fecha (para cálculo) no fim planeado ou à meia-noite — nunca se arrasta para os dias seguintes.
    const plan = plans.get(day);
    const close = plan?.plannedEnd ? at(day, plan.plannedEnd, rules.timeZone, plan.nightSchedule ? 1 : 0) : local(s.start, rules.timeZone).plus({ days: 1 }).startOf("day").toUTC().toISO()!;
    return { ...s, end: close > s.start ? close : s.start, open: !rules.autoClose, autoClosed: rules.autoClose, forgotten: true };
  });
  const byDay = attribute(segments, rules, plans);

  return dates.map((workDate) => {
    const segs = byDay.get(workDate) ?? [];
    const plan = plans.get(workDate) ?? { theoreticalMinutes: 0, plannedStart: null, plannedEnd: null, nightSchedule: false, excused: false };
    let worked = 0;
    let pending = 0;
    let breaks = 0;
    let night = 0;
    const hybridUsed = new Map<string, number>();
    for (const s of segs) {
      const d = secs(s.start, s.end);
      if (s.type === "break_unpaid" || s.type === "break_paid") breaks += d;
      // FE-103: pausa com tipo do catálogo → a regra do tipo decide quanto conta como trabalhado.
      const rule = s.breakTypeId ? rules.breakTypes?.[s.breakTypeId] : undefined;
      if (rule && (s.type === "break_unpaid" || s.type === "break_paid")) {
        let paid = rule.remuneration === "unpaid" ? 0 : d;
        if (rule.maxMinutes !== null) paid = Math.min(paid, rule.maxMinutes * 60);
        if (rule.remuneration === "hybrid") {
          const used = hybridUsed.get(s.breakTypeId!) ?? 0;
          paid = Math.min(paid, Math.max(0, (rule.hybridPaidMinutes ?? 0) * 60 - used));
          hybridUsed.set(s.breakTypeId!, used + paid);
        }
        if (paid > 0 && !(s.forgotten && !rules.incidentHoursCount && !plan.incidentValidated)) {
          worked += paid;
          night += nightSeconds({ ...s, end: new Date(Date.parse(s.start) + paid * 1000).toISOString() }, workDate, rules);
        } else if (paid > 0) pending += paid;
        continue;
      }
      if (!WORKING.includes(s.type)) continue;
      // D8: horas de um registo esquecido/fechado automaticamente ficam pendentes até validação.
      if (s.forgotten && !rules.incidentHoursCount && !plan.incidentValidated) {
        pending += d;
        continue;
      }
      worked += d;
      night += nightSeconds(s, workDate, rules);
    }
    worked += plan.creditSeconds ?? 0;
    if (rules.roundingMinutes > 0) {
      const step = rules.roundingMinutes * 60;
      worked = Math.round(worked / step) * step;
    }
    const incidents: IncidentType[] = [];
    const theoretical = plan.theoreticalMinutes * 60;
    if (segs.length === 0 && theoretical > 0 && !plan.excused && workDate < today) incidents.push("missing_in");
    if (forgotten.has(workDate)) incidents.push(rules.autoClose ? "auto_closed" : "missing_out");
    const firstWork = segs.find((s) => WORKING.includes(s.type));
    if (firstWork && plan.plannedStart) {
      const limit = DateTime.fromISO(at(workDate, plan.plannedStart, rules.timeZone)).plus({ minutes: rules.toleranceMinutes }).toUTC().toISO()!;
      if (firstWork.start > limit) incidents.push("late");
    }
    return {
      workDate,
      workedSeconds: worked,
      breakSeconds: breaks,
      nightSeconds: night,
      theoreticalSeconds: theoretical,
      excessSeconds: worked - theoretical,
      pendingSeconds: pending,
      segments: segs,
      // RE-14: um incidente por tipo e dia.
      incidents: [...new Set(incidents)],
    };
  });
}

/** "8h 59min" — truncado ao minuto (como observado), nunca arredondado. */
export function formatWorked(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const m = Math.floor(Math.abs(seconds) / 60);
  return `${sign}${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}min`;
}

/** Quadro do dia para o painel da gestão: planeado vs. real de um dia já apurado. */
export interface DayBoard {
  workDate: string;
  workedSeconds: number;
  theoreticalSeconds: number;
  incidents: IncidentType[];
  plannedStart: string | null;
  plannedEnd: string | null;
  /** Feriado confirmado ou ausência registada. */
  excused: boolean;
  /** Primeira entrada a trabalhar (UTC) e minutos depois do início planeado (0 = a horas). */
  firstInAt: string | null;
  lateMinutes: number;
  /** A hora de início planeada (+ tolerância) já passou. */
  startPassed: boolean;
  /** Tipo do registo aberto agora (null = sem registo aberto). */
  openType: Segment["type"] | null;
  /** Faixas do dia (UTC), para a linha do tempo. */
  segments: { start: string; end: string; type: Segment["type"] }[];
}

export function dayBoard(day: DayResult, plan: DayPlan | undefined, rules: Pick<EngineRules, "timeZone" | "toleranceMinutes">, now: string): DayBoard {
  const first = day.segments.find((s) => WORKING.includes(s.type));
  const start = plan?.plannedStart ? at(day.workDate, plan.plannedStart, rules.timeZone) : null;
  const limit = start ? DateTime.fromISO(start).plus({ minutes: rules.toleranceMinutes }).toUTC().toISO()! : null;
  const late = !!(first && start && limit && first.start > limit);
  const open = day.segments.find((s) => s.open && !s.autoClosed && !s.forgotten);
  return {
    workDate: day.workDate,
    workedSeconds: day.workedSeconds,
    theoreticalSeconds: day.theoreticalSeconds,
    incidents: day.incidents,
    plannedStart: plan?.plannedStart ?? null,
    plannedEnd: plan?.plannedEnd ?? null,
    excused: plan?.excused ?? false,
    firstInAt: first?.start ?? null,
    lateMinutes: late ? Math.floor((Date.parse(first!.start) - Date.parse(start!)) / 60_000) : 0,
    startPassed: !!limit && now > limit,
    openType: open?.type ?? null,
    segments: day.segments.map((s) => ({ start: s.start, end: s.end, type: s.type })),
  };
}
