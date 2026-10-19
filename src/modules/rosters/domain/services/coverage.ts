import { segmentRanges, type ShiftState } from "../entities/roster.js";
import { RosterValidationError } from "../errors.js";

/**
 * Plano de Cobertura (opcional por empresa): mínimos de pessoas por centro
 * (ou área do centro), dia da semana e intervalo. Uma exceção datada substitui,
 * nesse dia, as regras semanais do mesmo âmbito. Regras sobrepostas nunca se
 * somam: em cada instante vale o maior mínimo.
 */
export interface CoverageRule {
  id: string;
  locationId: string;
  /** null = o centro inteiro (todas as áreas e «Sem área»). */
  areaId: string | null;
  /** 1 = segunda … 7 = domingo (regra semanal); null numa exceção datada. */
  weekday: number | null;
  /** Exceção para um dia concreto (AAAA-MM-DD); null numa regra semanal. */
  date: string | null;
  /** "HH:MM"; fim ≤ início = termina no dia seguinte. */
  start: string;
  end: string;
  minPeople: number;
}

export type CoverageRuleInput = Omit<CoverageRule, "id">;

export interface CoverageWindow {
  start: string;
  end: string;
  /** O intervalo começa já no dia seguinte (madrugada de uma regra que passa a meia-noite). */
  startsNextDay: boolean;
  /** O intervalo acaba no dia seguinte (passa a meia-noite). */
  endsNextDay: boolean;
  required: number;
  /** Pessoas distintas na escala atual (rascunho incluído). */
  planned: number;
  /** Pessoas distintas no que está publicado. */
  published: number;
}

export interface CoverageDay {
  date: string;
  areaId: string | null;
  /** Sem regra para este dia e âmbito → «Não configurado» (nunca é défice). */
  status: "not_configured" | "ok" | "deficit";
  windows: CoverageWindow[];
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_MIN_PEOPLE = 500;

export function validateCoverageRule(r: CoverageRuleInput): void {
  if (!r.locationId) throw new RosterValidationError("Escolha o centro.", "locationId");
  const weekly = r.weekday !== null && r.weekday !== undefined;
  const dated = r.date !== null && r.date !== undefined;
  if (weekly === dated) throw new RosterValidationError("Indique o dia da semana ou uma data (exceção).", "weekday");
  if (weekly && (!Number.isInteger(r.weekday) || r.weekday! < 1 || r.weekday! > 7)) throw new RosterValidationError("Dia da semana inválido.", "weekday");
  if (dated && !DATE.test(r.date!)) throw new RosterValidationError("Data inválida.", "date");
  if (!TIME.test(r.start) || !TIME.test(r.end) || r.start === r.end) throw new RosterValidationError("Intervalo horário inválido.", "start");
  if (!Number.isInteger(r.minPeople) || r.minPeople < 0 || r.minPeople > MAX_MIN_PEOPLE) throw new RosterValidationError(`O mínimo é um número inteiro de 0 a ${MAX_MIN_PEOPLE}.`, "minPeople");
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const dayNumber = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
/** 1 = segunda … 7 = domingo. */
export const isoWeekday = (d: string) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Regras que valem num dia para um âmbito: as exceções datadas, se houver; senão as semanais. */
export function rulesForDay(rules: CoverageRule[], date: string, areaId: string | null): CoverageRule[] {
  const scope = rules.filter((r) => (r.areaId ?? null) === areaId);
  const dated = scope.filter((r) => r.date === date);
  return dated.length ? dated : scope.filter((r) => r.date === null && r.weekday === isoWeekday(date));
}

interface Presence {
  employeeId: string;
  start: number;
  end: number;
}

/** Intervalos (minutos absolutos) em que cada pessoa está de turno; folgas e dias de ausência não contam. */
function presences(states: ShiftState[], absent: (employeeId: string, date: string) => boolean): Presence[] {
  const out: Presence[] = [];
  for (const s of states) {
    if (s.kind !== "shift" || absent(s.employeeId, s.workDate)) continue;
    const base = dayNumber(s.workDate) * 1440;
    for (const r of segmentRanges(s.segments)) out.push({ employeeId: s.employeeId, start: base + r.start, end: base + r.end });
  }
  return out;
}

/** Pessoas distintas (cada uma conta uma vez) presentes durante todo o intervalo [a, b). */
const headcount = (ps: Presence[], a: number, b: number) => new Set(ps.filter((p) => p.start <= a && p.end >= b).map((p) => p.employeeId)).size;

/**
 * Cobertura de um âmbito (centro ou área) num dia: o dia é partido nos
 * instantes em que muda o mínimo ou alguém entra/sai; intervalos seguidos
 * iguais juntam-se. `planned` = estado atual dos turnos (rascunho incluído);
 * `published` = o que está publicado. Os turnos já vêm filtrados pelo âmbito.
 */
export function coverageDay(input: {
  date: string;
  areaId: string | null;
  rules: CoverageRule[];
  planned: ShiftState[];
  published: ShiftState[];
  absent: (employeeId: string, date: string) => boolean;
}): CoverageDay {
  const rules = rulesForDay(input.rules, input.date, input.areaId);
  if (!rules.length) return { date: input.date, areaId: input.areaId, status: "not_configured", windows: [] };
  const base = dayNumber(input.date) * 1440;
  const spans = rules.map((r) => {
    const a = toMin(r.start);
    let b = toMin(r.end);
    if (b <= a) b += 1440;
    return { start: base + a, end: base + b, min: r.minPeople };
  });
  const planned = presences(input.planned, input.absent);
  const published = presences(input.published, input.absent);
  const lo = Math.min(...spans.map((s) => s.start));
  const hi = Math.max(...spans.map((s) => s.end));
  const cuts = new Set<number>();
  for (const s of spans) cuts.add(s.start).add(s.end);
  for (const p of [...planned, ...published]) for (const t of [p.start, p.end]) if (t > lo && t < hi) cuts.add(t);
  const points = [...cuts].sort((a, b) => a - b);

  const raw: { a: number; b: number; required: number; planned: number; published: number }[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const active = spans.filter((s) => s.start <= a && s.end >= b);
    if (!active.length) continue;
    // Nunca somadas: vale o maior mínimo das regras que cobrem o intervalo.
    const required = Math.max(...active.map((s) => s.min));
    raw.push({ a, b, required, planned: headcount(planned, a, b), published: headcount(published, a, b) });
  }
  const merged: typeof raw = [];
  for (const w of raw) {
    const last = merged.at(-1);
    if (last && last.b === w.a && last.required === w.required && last.planned === w.planned && last.published === w.published) last.b = w.b;
    else merged.push({ ...w });
  }
  const windows = merged.map((w) => ({
    start: hhmm((w.a - base) % 1440),
    end: hhmm((w.b - base) % 1440),
    startsNextDay: w.a - base >= 1440,
    endsNextDay: w.b - base > 1440,
    required: w.required,
    planned: w.planned,
    published: w.published,
  }));
  return { date: input.date, areaId: input.areaId, status: windows.some((w) => w.planned < w.required) ? "deficit" : "ok", windows };
}
