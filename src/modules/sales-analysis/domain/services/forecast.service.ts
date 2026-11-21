import type { ForecastDay, IsoDate } from "../entities/sales-analysis.js";
import { addDays, daysInMonth, weekday } from "./dates.js";

/**
 * Previsão do resto do mês corrente.
 *
 * A IA recebe só totais por dia (valor e n.º de vendas), nunca documentos nem
 * dados de clientes. A resposta é validada; se a IA falhar ou responder algo
 * inválido, usa-se a regra de base (mesmo dia da semana nas últimas semanas).
 */

export interface DailyPoint {
  date: IsoDate;
  grossCents: number;
  count: number;
}

export interface ForecastInput {
  today: IsoDate;
  /** Dias que faltam prever (hoje incluído, se ainda não acabou). */
  targetDates: IsoDate[];
  /** Últimas semanas, dias fechados (máx. 42). */
  history: DailyPoint[];
  /** Mês corrente até ontem. */
  monthToDate: DailyPoint[];
  /** O mesmo mês, no ano anterior (mês inteiro). */
  sameMonthLastYear: DailyPoint[];
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Dias a prever: de hoje até ao fim do mês. */
export function remainingDates(today: IsoDate): IsoDate[] {
  const [y = 0, m = 1] = today.split("-").map(Number);
  const last = `${today.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
  const out: IsoDate[] = [];
  for (let d = today; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Regra de base: mediana do mesmo dia da semana; intervalo = mínimo e máximo observados. */
export function baselineForecast(input: ForecastInput): ForecastDay[] {
  return input.targetDates.map((date) => {
    const wd = weekday(date);
    const same = input.history.filter((p) => weekday(p.date) === wd).sort((a, b) => a.grossCents - b.grossCents);
    if (same.length === 0) return { date, expectedCents: 0, lowCents: 0, highCents: 0, expectedCount: 0 };
    const mid = same[Math.floor(same.length / 2)]!;
    return {
      date,
      expectedCents: mid.grossCents,
      lowCents: same[0]!.grossCents,
      highCents: same[same.length - 1]!.grossCents,
      expectedCount: mid.count,
    };
  });
}

/** Texto do pedido à IA (português; resposta pedida em JSON estrito). */
export function buildForecastPrompt(input: ForecastInput): string {
  const fmt = (p: DailyPoint) => `${p.date} (${WEEKDAYS[weekday(p.date)]}): ${(p.grossCents / 100).toFixed(2)} €, ${p.count} vendas`;
  return [
    "És um analista de vendas de um restaurante (pizzaria) em Portugal.",
    "Com base no histórico diário abaixo, prevê as vendas de cada dia que falta do mês corrente.",
    "Olha para o padrão de cada dia da semana (os dias mais fracos e os mais fortes), para a tendência deste mês e para o mesmo mês do ano passado (feriados, sazonalidade).",
    "Para cada dia dá um valor provável e um intervalo realista: o mínimo deve refletir um dia fraco desse dia da semana e o máximo um dia forte.",
    "",
    `Hoje: ${input.today} (${WEEKDAYS[weekday(input.today)]}).`,
    "",
    "Últimas semanas (dias fechados):",
    ...input.history.map(fmt),
    "",
    "Mês corrente até ontem:",
    ...(input.monthToDate.length ? input.monthToDate.map(fmt) : ["(sem dias fechados ainda)"]),
    "",
    "Mesmo mês do ano passado:",
    ...(input.sameMonthLastYear.length ? input.sameMonthLastYear.map(fmt) : ["(sem dados)"]),
    "",
    `Dias a prever: ${input.targetDates.join(", ")}.`,
    "",
    'Responde APENAS com JSON neste formato, valores em euros com IVA: {"days":[{"date":"AAAA-MM-DD","expected":0,"low":0,"high":0,"count":0}],"note":"uma frase curta em português de Portugal sobre o raciocínio"}',
  ].join("\n");
}

/**
 * Valida a resposta da IA. Devolve null se faltar algum dia, houver valores
 * negativos ou absurdos (mais de 5× o máximo histórico) — aí usa-se a regra de base.
 */
export function parseForecastResponse(raw: string | null, input: ForecastInput): { days: ForecastDay[]; note?: string | undefined } | null {
  if (!raw) return null;
  let json: unknown;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    json = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const days = (json as { days?: unknown }).days;
  if (!Array.isArray(days)) return null;
  const maxHist = Math.max(1, ...input.history.map((p) => p.grossCents), ...input.sameMonthLastYear.map((p) => p.grossCents));
  const byDate = new Map<string, ForecastDay>();
  for (const d of days as Record<string, unknown>[]) {
    const date = d.date;
    const [e = NaN, l = NaN, h = NaN, c = NaN] = [d.expected, d.low, d.high, d.count].map(Number);
    if (typeof date !== "string" || [e, l, h, c].some((n) => !Number.isFinite(n) || n < 0)) return null;
    const expected = Math.round(e * 100);
    let low = Math.round(l * 100);
    let high = Math.round(h * 100);
    if (low > expected) low = expected;
    if (high < expected) high = expected;
    if (high > maxHist * 5) return null;
    byDate.set(date, { date, expectedCents: expected, lowCents: low, highCents: high, expectedCount: Math.round(c) });
  }
  const out: ForecastDay[] = [];
  for (const date of input.targetDates) {
    const d = byDate.get(date);
    if (!d) return null;
    out.push(d);
  }
  const note = (json as { note?: unknown }).note;
  return typeof note === "string" ? { days: out, note: note.slice(0, 300) } : { days: out };
}
