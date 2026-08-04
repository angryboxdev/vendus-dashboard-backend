import { DateTime } from "luxon";
import type { GetAnalyticsCurrentPort, GetAnalyticsCurrentParams } from "../../domain/ports/in/get-analytics-current.port.js";
import type { VendusGatewayPort } from "../../domain/ports/out/vendus-gateway.port.js";
import type { AnalyticsCurrentResponse, WeekdayEntry } from "../../domain/entities/vendus-analytics.js";
import type { VendusDocument } from "../../domain/entities/vendus-document.js";

const LISBON = "Europe/Lisbon";
const ALERT_THRESHOLD_PCT = 20;
const WEEKDAY_LABELS: Record<number, string> = {
  1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta",
  5: "Sexta", 6: "Sábado", 7: "Domingo",
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function sumGrossCents(docs: VendusDocument[]): number {
  return docs.reduce((acc, d) => {
    const c = Math.round(parseFloat(d.amount_gross) * 100) || 0;
    return d.type === "NC" ? acc - c : acc + c;
  }, 0);
}

function countInvoices(docs: VendusDocument[]): number {
  return docs.filter((d) => d.type === "FS" || d.type === "FT").length;
}

function daysInMonth(year: number, month: number): number {
  return DateTime.fromObject({ year, month, day: 1 }, { zone: LISBON }).daysInMonth ?? 30;
}

function dayWeight(year: number, month: number, day: number): number {
  const weekday = DateTime.fromObject({ year, month, day }, { zone: LISBON }).weekday;
  return weekday >= 6 ? 2 : 1;
}

function weightedDays(year: number, month: number, fromDay: number, toDay: number): number {
  let w = 0;
  for (let d = fromDay; d <= toDay; d++) w += dayWeight(year, month, d);
  return w;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── Use case ─────────────────────────────────────────────────────────────────

export class GetAnalyticsCurrentUseCase implements GetAnalyticsCurrentPort {
  constructor(private readonly gateway: VendusGatewayPort) {}

  async execute(params: GetAnalyticsCurrentParams): Promise<AnalyticsCurrentResponse> {
    const startedAt = Date.now();
    const { year, month } = params;
    const now = DateTime.now().setZone(LISBON);
    const isCurrentMonth = now.year === year && now.month === month;

    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const todayStr = now.toFormat("yyyy-MM-dd");
    const daysInMo = daysInMonth(year, month);

    let periodEnd: string;
    let daysElapsed: number;
    if (isCurrentMonth) {
      if (now.day === 1) {
        periodEnd = todayStr;
        daysElapsed = 1;
      } else {
        periodEnd = now.minus({ days: 1 }).toFormat("yyyy-MM-dd");
        daysElapsed = now.day - 1;
      }
    } else {
      periodEnd = DateTime.fromObject({ year, month, day: 1 }, { zone: LISBON })
        .endOf("month")
        .toFormat("yyyy-MM-dd");
      daysElapsed = daysInMo;
    }

    // Fetch month docs + today docs in parallel
    const [monthDocs, todayDocs] = await Promise.all([
      this.gateway.listDocuments({ since: monthStart, until: periodEnd, type: "FS,FT,NC" }),
      isCurrentMonth
        ? this.gateway.listDocuments({ since: todayStr, until: todayStr, type: "FS,FT,NC" })
        : Promise.resolve([] as VendusDocument[]),
    ]);

    // Month metrics
    const monthGrossCents = sumGrossCents(monthDocs);
    const monthCount = countInvoices(monthDocs);
    const dailyAvgCents = daysElapsed > 0 ? Math.round(monthGrossCents / daysElapsed) : 0;

    // Weighted projection
    const weightElapsed = daysElapsed > 0 ? weightedDays(year, month, 1, daysElapsed) : 0;
    const weightTotal = weightedDays(year, month, 1, daysInMo);
    const weightedRate = weightElapsed > 0 ? monthGrossCents / weightElapsed : 0;
    const expectedGrossCents = Math.round(weightedRate * weightTotal);
    const pctOfExpected = expectedGrossCents > 0 ? (monthGrossCents / expectedGrossCents) * 100 : 0;
    const avgTicketCents = monthCount > 0 ? Math.round(monthGrossCents / monthCount) : 0;

    // Today metrics
    const todayGrossCents = sumGrossCents(todayDocs);
    const todayCount = countInvoices(todayDocs);
    const vsDailyAvgPct = dailyAvgCents > 0
      ? ((todayGrossCents - dailyAvgCents) / dailyAvgCents) * 100
      : 0;

    // By weekday (month docs only, FS/FT only)
    type WeekdayAcc = { grossCents: number; docsCount: number; dates: Set<string> };
    const weekdayMap = new Map<number, WeekdayAcc>();
    for (let w = 1; w <= 7; w++) weekdayMap.set(w, { grossCents: 0, docsCount: 0, dates: new Set() });
    for (const doc of monthDocs) {
      if (doc.type !== "FS" && doc.type !== "FT") continue;
      const w = DateTime.fromISO(doc.date, { zone: LISBON }).weekday;
      const e = weekdayMap.get(w)!;
      e.grossCents += Math.round(parseFloat(doc.amount_gross) * 100) || 0;
      e.docsCount++;
      e.dates.add(doc.date);
    }
    const by_weekday: WeekdayEntry[] = Array.from({ length: 7 }, (_, i) => {
      const w = i + 1;
      const e = weekdayMap.get(w)!;
      const daysCount = e.dates.size;
      return {
        weekday: w,
        label: WEEKDAY_LABELS[w] ?? String(w),
        gross: e.grossCents / 100,
        avg_gross: daysCount > 0 ? Math.round(e.grossCents / daysCount) / 100 : 0,
        days_count: daysCount,
        documents_count: e.docsCount,
      };
    });

    return {
      period: {
        year, month,
        from: monthStart,
        to: isCurrentMonth ? todayStr : periodEnd,
        is_current_month: isCurrentMonth,
        documents_count: monthCount + (isCurrentMonth ? countInvoices(todayDocs) : 0),
      },
      today: isCurrentMonth
        ? {
            gross: todayGrossCents / 100,
            documents_count: todayCount,
            vs_daily_avg_pct: round1(vsDailyAvgPct),
            is_below_threshold: vsDailyAvgPct < -ALERT_THRESHOLD_PCT,
          }
        : null,
      month: {
        gross: monthGrossCents / 100,
        documents_count: monthCount,
        days_elapsed: daysElapsed,
        days_in_month: daysInMo,
        daily_avg: dailyAvgCents / 100,
        expected_gross: expectedGrossCents / 100,
        pct_of_expected: round1(pctOfExpected),
        avg_ticket: avgTicketCents / 100,
      },
      by_weekday,
      debug: { took_ms: Date.now() - startedAt },
    };
  }
}
