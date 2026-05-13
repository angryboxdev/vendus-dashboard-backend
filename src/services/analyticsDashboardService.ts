import { DateTime } from "luxon";
import { fetchAllDocuments } from "./documentsService.js";
import { ENV } from "../config/env.js";
import type { VendusDocument } from "../domain/types.js";
import { toCents, fromCents } from "../utils/numbers.js";
import { getSupabaseServiceRole } from "../infra/supabaseClient.js";

const LISBON = "Europe/Lisbon";
const PER_PAGE = 200;
const ALERT_THRESHOLD_PCT = 20;

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta",
  5: "Sexta",  6: "Sábado", 7: "Domingo",
};

const MONTH_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ---- helpers ----------------------------------------------------------------

/**
 * sum(FS) - sum(NC): as NC vêm com amount_gross positivo no endpoint de lista.
 */
function sumGrossCents(docs: VendusDocument[]): number {
  return docs.reduce((acc, d) => {
    const c = toCents(d.amount_gross);
    return d.type === "NC" ? acc - c : acc + c;
  }, 0);
}

function countFsDocs(docs: VendusDocument[]): number {
  return docs.filter((d) => d.type === "FS").length;
}

/** Fetch único paginado FS+NC — sem fetches de detalhe. */
async function fetchDocs(since: string, until: string): Promise<VendusDocument[]> {
  const { documents } = await fetchAllDocuments(since, until, "FS,NC", PER_PAGE);
  return documents as VendusDocument[];
}

function daysInMonthCount(year: number, month: number): number {
  return DateTime.fromObject({ year, month, day: 1 }, { zone: LISBON }).daysInMonth ?? 30;
}

/** Peso de um dia: 2 para sábado/domingo, 1 para dias de semana. */
function dayWeight(year: number, month: number, day: number): number {
  const weekday = DateTime.fromObject({ year, month, day }, { zone: LISBON }).weekday;
  return weekday >= 6 ? 2 : 1;
}

/** Soma de pesos dos dias fromDay..toDay (inclusive) de um dado mês. */
function weightedDays(year: number, month: number, fromDay: number, toDay: number): number {
  let w = 0;
  for (let d = fromDay; d <= toDay; d++) w += dayWeight(year, month, d);
  return w;
}

function monthFirstLast(year: number, month: number): { from: string; to: string } {
  const start = DateTime.fromObject({ year, month, day: 1 }, { zone: LISBON });
  return {
    from: start.toFormat("yyyy-MM-dd"),
    to: start.endOf("month").toFormat("yyyy-MM-dd"),
  };
}

function growthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${String(year).slice(2)}`;
}

// ---- shared date context ----------------------------------------------------

type DateContext = {
  isCurrentMonth: boolean;
  todayStr: string | null;
  monthStartStr: string;
  periodEndStr: string;
  daysElapsed: number;
  daysInMonth: number;
  yearStart: string;
  yearEnd: string;
};

function buildDateContext(year: number, month: number): DateContext {
  const now = DateTime.now().setZone(LISBON);
  const isCurrentMonth = now.year === year && now.month === month;
  const monthStartStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = daysInMonthCount(year, month);

  let periodEndStr: string;
  let daysElapsed: number;
  let todayStr: string | null = null;

  if (isCurrentMonth) {
    todayStr = now.toFormat("yyyy-MM-dd");
    if (now.day === 1) {
      periodEndStr = todayStr;
      daysElapsed = 1;
    } else {
      periodEndStr = now.minus({ days: 1 }).toFormat("yyyy-MM-dd");
      daysElapsed = now.day - 1;
    }
  } else {
    periodEndStr = DateTime.fromObject({ year, month, day: 1 }, { zone: LISBON })
      .endOf("month")
      .toFormat("yyyy-MM-dd");
    daysElapsed = daysInMonth;
  }

  const yearStart = `${year}-01-01`;
  const yearEnd = isCurrentMonth
    ? todayStr!
    : now.year === year
    ? now.toFormat("yyyy-MM-dd")
    : `${year}-12-31`;

  return { isCurrentMonth, todayStr, monthStartStr, periodEndStr, daysElapsed, daysInMonth, yearStart, yearEnd };
}

/** Os últimos 6 meses (incluindo o mês visualizado) mais antigo → mais recente. */
function last6MonthSlots(year: number, month: number, ctx: DateContext) {
  return Array.from({ length: 6 }, (_, i) => {
    const dt = DateTime.fromObject({ year, month, day: 1 }, { zone: LISBON }).minus({ months: 5 - i });
    const mYear = dt.year;
    const mMonth = dt.month;
    const isCurrent = mYear === year && mMonth === month;
    const { from } = monthFirstLast(mYear, mMonth);
    const to = isCurrent && ctx.isCurrentMonth ? ctx.todayStr! : monthFirstLast(mYear, mMonth).to;
    return { year: mYear, month: mMonth, from, to, isCurrent };
  });
}

// ---- public types -----------------------------------------------------------

export type WeekdayEntry = {
  weekday: number;
  label: string;
  gross: number;
  avg_gross: number;
  days_count: number;
  documents_count: number;
};

export type GrowthSlot = {
  year: number;
  month: number;
  label: string;
  gross: number;
  documents_count: number;
};

/**
 * Resposta rápida: apenas dados do mês (+ hoje).
 * Não inclui total anual nem gráfico de crescimento — esses ficam no histórico.
 */
export type AnalyticsCurrentResponse = {
  period: {
    year: number;
    month: number;
    from: string;
    to: string;
    is_current_month: boolean;
    documents_count: number;
  };
  today: {
    gross: number;
    documents_count: number;
    vs_daily_avg_pct: number;
    is_below_threshold: boolean;
  } | null;
  month: {
    gross: number;
    documents_count: number;
    days_elapsed: number;
    days_in_month: number;
    daily_avg: number;
    expected_gross: number;
    pct_of_expected: number;
    avg_ticket: number;
  };
  by_weekday: WeekdayEntry[];
  debug: { took_ms: number };
};

export type AnalyticsHistoricalResponse = {
  annual: {
    gross: number;
    year: number;
    documents_count: number;
  };
  historical: {
    gross: number;
    since: string;
    documents_count: number;
  };
  /** 6 slots do gráfico de crescimento, todos preenchidos. */
  monthly_growth: GrowthSlot[];
  comparisons: {
    /** Mês anterior ao visualizado. */
    prev_month: {
      year: number;
      month: number;
      label: string;
      gross: number;
      daily_avg: number;
      avg_ticket: number;
      documents_count: number;
    } | null;
    /** Mesmo período YTD do ano anterior. */
    prev_year_ytd: {
      year: number;
      gross: number;
      documents_count: number;
    } | null;
  };
  debug: { took_ms: number; history_start_year: number };
};

// ---- current (fast) ---------------------------------------------------------

export async function buildAnalyticsCurrent(params: {
  year: number;
  month: number;
}): Promise<AnalyticsCurrentResponse> {
  const startedAt = Date.now();
  const { year, month } = params;
  const ctx = buildDateContext(year, month);
  const { isCurrentMonth, todayStr, monthStartStr, periodEndStr, daysElapsed, daysInMonth } = ctx;

  // Fetch apenas o mês (dias completos) + hoje em paralelo
  const [monthDocs, todayDocs] = await Promise.all([
    fetchDocs(monthStartStr, periodEndStr),
    isCurrentMonth && todayStr ? fetchDocs(todayStr, todayStr) : Promise.resolve([]),
  ]);

  // Métricas do mês
  const monthGrossCents = sumGrossCents(monthDocs);
  const monthCount = countFsDocs(monthDocs);
  const dailyAvgCents = daysElapsed > 0 ? Math.round(monthGrossCents / daysElapsed) : 0;

  // Projeção ponderada: sáb/dom valem 2×, seg–sex valem 1×
  // rate = acumulado ÷ peso_decorrido; projeção = rate × peso_total_mês
  const weightElapsed = daysElapsed > 0 ? weightedDays(year, month, 1, daysElapsed) : 0;
  const weightTotal = weightedDays(year, month, 1, daysInMonth);
  const weightedRate = weightElapsed > 0 ? monthGrossCents / weightElapsed : 0;
  const expectedGrossCents = Math.round(weightedRate * weightTotal);
  const pctOfExpected = expectedGrossCents > 0 ? (monthGrossCents / expectedGrossCents) * 100 : 0;
  const avgTicketCents = monthCount > 0 ? Math.round(monthGrossCents / monthCount) : 0;

  // Hoje
  const todayGrossCents = sumGrossCents(todayDocs);
  const todayCount = countFsDocs(todayDocs);
  const vsDailyAvgPct = dailyAvgCents > 0 ? ((todayGrossCents - dailyAvgCents) / dailyAvgCents) * 100 : 0;

  // Por dia da semana (só FS, dias completos do mês)
  type WeekdayAcc = { grossCents: number; docsCount: number; dates: Set<string> };
  const weekdayMap = new Map<number, WeekdayAcc>();
  for (let w = 1; w <= 7; w++) weekdayMap.set(w, { grossCents: 0, docsCount: 0, dates: new Set() });
  for (const doc of monthDocs) {
    if (doc.type !== "FS") continue;
    const w = DateTime.fromISO(doc.date, { zone: LISBON }).weekday;
    const e = weekdayMap.get(w)!;
    e.grossCents += toCents(doc.amount_gross);
    e.docsCount++;
    e.dates.add(doc.date);
  }
  const byWeekday: WeekdayEntry[] = Array.from({ length: 7 }, (_, i) => {
    const w = i + 1;
    const e = weekdayMap.get(w)!;
    const daysCount = e.dates.size;
    return {
      weekday: w,
      label: WEEKDAY_LABELS[w] ?? String(w),
      gross: fromCents(e.grossCents),
      avg_gross: daysCount > 0 ? fromCents(Math.round(e.grossCents / daysCount)) : 0,
      days_count: daysCount,
      documents_count: e.docsCount,
    };
  });

  return {
    period: {
      year, month,
      from: monthStartStr,
      to: isCurrentMonth ? todayStr! : periodEndStr,
      is_current_month: isCurrentMonth,
      documents_count: monthCount + countFsDocs(todayDocs),
    },
    today: isCurrentMonth ? {
      gross: fromCents(todayGrossCents),
      documents_count: todayCount,
      vs_daily_avg_pct: Math.round(vsDailyAvgPct * 10) / 10,
      is_below_threshold: vsDailyAvgPct < -ALERT_THRESHOLD_PCT,
    } : null,
    month: {
      gross: fromCents(monthGrossCents),
      documents_count: monthCount,
      days_elapsed: daysElapsed,
      days_in_month: daysInMonth,
      daily_avg: fromCents(dailyAvgCents),
      expected_gross: fromCents(expectedGrossCents),
      pct_of_expected: Math.round(pctOfExpected * 10) / 10,
      avg_ticket: fromCents(avgTicketCents),
    },
    by_weekday: byWeekday,
    debug: { took_ms: Date.now() - startedAt },
  };
}

// ---- cache helpers ----------------------------------------------------------

type CachedMonthRow = { year: number; month: number; gross_cents: number; documents_count: number };
type CacheMap = Map<number, Map<number, CachedMonthRow>>;

async function loadCachedMonths(pastYears: number[]): Promise<CacheMap> {
  const map: CacheMap = new Map();
  if (pastYears.length === 0) return map;
  try {
    const sb = getSupabaseServiceRole();
    if (!sb) return map;
    const { data } = await sb
      .from("analytics_monthly_cache")
      .select("year, month, gross_cents, documents_count")
      .in("year", pastYears);
    for (const row of data ?? []) {
      if (!map.has(row.year)) map.set(row.year, new Map());
      map.get(row.year)!.set(row.month, {
        year: row.year,
        month: row.month,
        gross_cents: Number(row.gross_cents),
        documents_count: row.documents_count,
      });
    }
  } catch (e) {
    console.error("[analytics cache] load failed (fallback to Vendus):", e);
  }
  return map;
}

async function saveCachedMonths(rows: CachedMonthRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const sb = getSupabaseServiceRole();
    if (!sb) return;
    await sb.from("analytics_monthly_cache").upsert(rows);
  } catch (e) {
    console.error("[analytics cache] save failed (non-fatal):", e);
  }
}

// ---- historical (slow) ------------------------------------------------------

export async function buildAnalyticsHistorical(params: {
  year: number;
  month: number;
}): Promise<AnalyticsHistoricalResponse> {
  const startedAt = Date.now();
  const { year, month } = params;
  const ctx = buildDateContext(year, month);
  const historyStartYear = ENV.ANALYTICS_HISTORY_START_YEAR;

  const pastYears: number[] = [];
  for (let y = historyStartYear; y < year; y++) pastYears.push(y);

  // Meses completos do ano atual: Jan até (month-1). São imutáveis, podem ser cacheados.
  const currentYearCompleteMonths = Array.from({ length: month - 1 }, (_, i) => i + 1);

  // 1. Verificar cache para tudo — anos passados + meses completos do ano atual
  const allYearsToCheck = [...pastYears, ...(currentYearCompleteMonths.length > 0 ? [year] : [])];
  const cacheByYear = await loadCachedMonths(allYearsToCheck);

  // 2. Identificar o que falta no cache
  const pastYearsMissing = pastYears.filter((y) => (cacheByYear.get(y)?.size ?? 0) < 12);
  const currentYearMonthsMissing = currentYearCompleteMonths.filter(
    (m) => !cacheByYear.get(year)?.has(m)
  );

  // 3. Mês atual (parcial): sempre fresco do Vendus, em paralelo com os fetches de cache miss
  const currentMonthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const [currentMonthDocs, freshPastYearDocs, freshCurrentYearDocs] = await Promise.all([
    fetchDocs(currentMonthStart, ctx.yearEnd),
    Promise.all(pastYearsMissing.map((y) => fetchDocs(`${y}-01-01`, `${y}-12-31`))),
    currentYearMonthsMissing.length > 0
      ? fetchDocs(
          `${year}-${String(Math.min(...currentYearMonthsMissing)).padStart(2, "0")}-01`,
          DateTime.fromObject({ year, month: Math.max(...currentYearMonthsMissing), day: 1 }, { zone: LISBON })
            .endOf("month")
            .toFormat("yyyy-MM-dd")
        )
      : Promise.resolve([] as VendusDocument[]),
  ]);

  // 4. Calcular e guardar os meses em falta
  const toSave: CachedMonthRow[] = [];

  function computeAndCacheMonth(y: number, m: number, docs: VendusDocument[]) {
    const mStart = `${y}-${String(m).padStart(2, "0")}-01`;
    const mEnd = DateTime.fromObject({ year: y, month: m, day: 1 }, { zone: LISBON })
      .endOf("month")
      .toFormat("yyyy-MM-dd");
    const mDocs = docs.filter((d) => d.date >= mStart && d.date <= mEnd);
    const row: CachedMonthRow = { year: y, month: m, gross_cents: sumGrossCents(mDocs), documents_count: countFsDocs(mDocs) };
    if (!cacheByYear.has(y)) cacheByYear.set(y, new Map());
    cacheByYear.get(y)!.set(m, row);
    toSave.push(row);
  }

  for (let i = 0; i < pastYearsMissing.length; i++) {
    const y = pastYearsMissing[i]!;
    for (let m = 1; m <= 12; m++) computeAndCacheMonth(y, m, freshPastYearDocs[i]!);
  }
  for (const m of currentYearMonthsMissing) {
    computeAndCacheMonth(year, m, freshCurrentYearDocs);
  }

  void saveCachedMonths(toSave);

  // 5. Calcular métricas — tudo via cache + mês atual fresco

  // Total anual = meses completos cacheados + mês atual fresco
  let annualGrossCents = sumGrossCents(currentMonthDocs);
  let annualCount = countFsDocs(currentMonthDocs);
  const currentYearMap = cacheByYear.get(year);
  if (currentYearMap) {
    for (const [m, row] of currentYearMap) {
      if (m < month) { annualGrossCents += row.gross_cents; annualCount += row.documents_count; }
    }
  }

  // Total histórico = anual + todos os anos passados
  let historicalGrossCents = annualGrossCents;
  let historicalCount = annualCount;
  for (const y of pastYears) {
    const yearMap = cacheByYear.get(y);
    if (!yearMap) continue;
    for (const row of yearMap.values()) {
      historicalGrossCents += row.gross_cents;
      historicalCount += row.documents_count;
    }
  }

  // Gráfico de crescimento
  const slots = last6MonthSlots(year, month, ctx);
  const monthlyGrowth: GrowthSlot[] = slots.map((slot) => {
    if (slot.year === year && slot.month === month) {
      return { year: slot.year, month: slot.month, label: growthLabel(slot.year, slot.month), gross: fromCents(sumGrossCents(currentMonthDocs)), documents_count: countFsDocs(currentMonthDocs) };
    }
    const cached = cacheByYear.get(slot.year)?.get(slot.month);
    return { year: slot.year, month: slot.month, label: growthLabel(slot.year, slot.month), gross: fromCents(cached?.gross_cents ?? 0), documents_count: cached?.documents_count ?? 0 };
  });

  // Comparações — mês anterior (sempre no cache após primeira chamada)
  const prevMonthDt = DateTime.fromObject({ year, month, day: 1 }, { zone: LISBON }).minus({ months: 1 });
  const pmYear = prevMonthDt.year;
  const pmMonth = prevMonthDt.month;
  const pmDays = prevMonthDt.daysInMonth ?? 30;

  let prevMonth: AnalyticsHistoricalResponse["comparisons"]["prev_month"] = null;
  if (pmYear >= historyStartYear) {
    const cached = cacheByYear.get(pmYear)?.get(pmMonth);
    const pmGrossCents = cached?.gross_cents ?? 0;
    const pmCount = cached?.documents_count ?? 0;
    prevMonth = {
      year: pmYear, month: pmMonth, label: growthLabel(pmYear, pmMonth),
      gross: fromCents(pmGrossCents),
      daily_avg: fromCents(pmDays > 0 ? Math.round(pmGrossCents / pmDays) : 0),
      avg_ticket: pmCount > 0 ? fromCents(Math.round(pmGrossCents / pmCount)) : 0,
      documents_count: pmCount,
    };
  }

  // YTD do ano anterior
  const prevYear = year - 1;
  const prevYearMap = cacheByYear.get(prevYear);
  let prevYearYtd: AnalyticsHistoricalResponse["comparisons"]["prev_year_ytd"] = null;
  if (prevYearMap) {
    let pyGrossCents = 0; let pyCount = 0;
    for (let m = 1; m <= month; m++) {
      const row = prevYearMap.get(m);
      if (row) { pyGrossCents += row.gross_cents; pyCount += row.documents_count; }
    }
    prevYearYtd = { year: prevYear, gross: fromCents(pyGrossCents), documents_count: pyCount };
  }

  return {
    annual: { gross: fromCents(annualGrossCents), year, documents_count: annualCount },
    historical: { gross: fromCents(historicalGrossCents), since: `${historyStartYear}-01-01`, documents_count: historicalCount },
    monthly_growth: monthlyGrowth,
    comparisons: { prev_month: prevMonth, prev_year_ytd: prevYearYtd },
    debug: { took_ms: Date.now() - startedAt, history_start_year: historyStartYear },
  };
}
