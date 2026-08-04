import { DateTime } from "luxon";
import type { GetAnalyticsHistoricalPort, GetAnalyticsHistoricalParams } from "../../domain/ports/in/get-analytics-historical.port.js";
import type { VendusGatewayPort } from "../../domain/ports/out/vendus-gateway.port.js";
import type { AnalyticsCachePort, CachedMonthRow } from "../../domain/ports/out/analytics-cache.port.js";
import type { AnalyticsHistoricalResponse, GrowthSlot } from "../../domain/entities/vendus-analytics.js";
import type { VendusDocument } from "../../domain/entities/vendus-document.js";

const LISBON = "Europe/Lisbon";
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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

function growthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${String(year).slice(2)}`;
}

function monthFirstLast(year: number, month: number, zone: string): { from: string; to: string } {
  const start = DateTime.fromObject({ year, month, day: 1 }, { zone });
  return {
    from: start.toFormat("yyyy-MM-dd"),
    to: start.endOf("month").toFormat("yyyy-MM-dd"),
  };
}

// ─── Use case ─────────────────────────────────────────────────────────────────

export class GetAnalyticsHistoricalUseCase implements GetAnalyticsHistoricalPort {
  constructor(
    private readonly gateway: VendusGatewayPort,
    private readonly cache: AnalyticsCachePort,
    private readonly historyStartYear: number,
  ) {}

  async execute(params: GetAnalyticsHistoricalParams): Promise<AnalyticsHistoricalResponse> {
    const startedAt = Date.now();
    const { year, month } = params;
    const now = DateTime.now().setZone(LISBON);
    const isCurrentMonth = now.year === year && now.month === month;

    // Build list of past years + complete months of current year (cacheable)
    const pastYears: number[] = [];
    for (let y = this.historyStartYear; y < year; y++) pastYears.push(y);
    const currentYearCompleteMonths = Array.from({ length: month - 1 }, (_, i) => i + 1);

    // Load cache
    const allYearsToCheck = [...pastYears, ...(currentYearCompleteMonths.length > 0 ? [year] : [])];
    const cachedRows = await this.cache.getMonths(allYearsToCheck);

    // Build cache map
    const cacheByYear = new Map<number, Map<number, CachedMonthRow>>();
    for (const row of cachedRows) {
      if (!cacheByYear.has(row.year)) cacheByYear.set(row.year, new Map());
      cacheByYear.get(row.year)!.set(row.month, row);
    }

    // Identify what's missing from cache
    const pastYearsMissing = pastYears.filter((y) => (cacheByYear.get(y)?.size ?? 0) < 12);
    const currentYearMonthsMissing = currentYearCompleteMonths.filter(
      (m) => !cacheByYear.get(year)?.has(m),
    );

    // Determine yearEnd for current fetch
    const yearEnd = isCurrentMonth
      ? now.toFormat("yyyy-MM-dd")
      : now.year === year
        ? now.toFormat("yyyy-MM-dd")
        : `${year}-12-31`;

    const currentMonthStart = `${year}-${String(month).padStart(2, "0")}-01`;

    // Fetch in parallel: current month (always fresh) + cache misses
    const [currentMonthDocs, freshPastYearDocs, freshCurrentYearDocs] = await Promise.all([
      this.gateway.listDocuments({ since: currentMonthStart, until: yearEnd, type: "FS,FT,NC" }),
      Promise.all(
        pastYearsMissing.map((y) =>
          this.gateway.listDocuments({ since: `${y}-01-01`, until: `${y}-12-31`, type: "FS,FT,NC" }),
        ),
      ),
      currentYearMonthsMissing.length > 0
        ? this.gateway.listDocuments({
            since: `${year}-${String(Math.min(...currentYearMonthsMissing)).padStart(2, "0")}-01`,
            until: DateTime.fromObject(
              { year, month: Math.max(...currentYearMonthsMissing), day: 1 },
              { zone: LISBON },
            )
              .endOf("month")
              .toFormat("yyyy-MM-dd"),
            type: "FS,FT,NC",
          })
        : Promise.resolve([] as VendusDocument[]),
    ]);

    // Compute and cache missing months
    const toSave: CachedMonthRow[] = [];

    const computeAndCache = (y: number, m: number, docs: VendusDocument[]) => {
      const mStart = `${y}-${String(m).padStart(2, "0")}-01`;
      const mEnd = monthFirstLast(y, m, LISBON).to;
      const mDocs = docs.filter((d) => d.date >= mStart && d.date <= mEnd);
      const row: CachedMonthRow = {
        year: y,
        month: m,
        gross_cents: sumGrossCents(mDocs),
        documents_count: countInvoices(mDocs),
      };
      if (!cacheByYear.has(y)) cacheByYear.set(y, new Map());
      cacheByYear.get(y)!.set(m, row);
      toSave.push(row);
    };

    for (let i = 0; i < pastYearsMissing.length; i++) {
      const y = pastYearsMissing[i]!;
      for (let m = 1; m <= 12; m++) computeAndCache(y, m, freshPastYearDocs[i]!);
    }
    for (const m of currentYearMonthsMissing) {
      computeAndCache(year, m, freshCurrentYearDocs);
    }

    void this.cache.saveMonths(toSave);

    // Annual = complete months cached + current month fresh
    let annualGrossCents = sumGrossCents(currentMonthDocs);
    let annualCount = countInvoices(currentMonthDocs);
    const currentYearMap = cacheByYear.get(year);
    if (currentYearMap) {
      for (const [m, row] of currentYearMap) {
        if (m < month) {
          annualGrossCents += row.gross_cents;
          annualCount += row.documents_count;
        }
      }
    }

    // Historical = annual + all past years
    let historicalGrossCents = annualGrossCents;
    let historicalCount = annualCount;
    for (const y of pastYears) {
      const yMap = cacheByYear.get(y);
      if (!yMap) continue;
      for (const row of yMap.values()) {
        historicalGrossCents += row.gross_cents;
        historicalCount += row.documents_count;
      }
    }

    // Growth chart: last 6 months
    const slots: GrowthSlot[] = Array.from({ length: 6 }, (_, i) => {
      const dt = DateTime.fromObject({ year, month, day: 1 }, { zone: LISBON }).minus({ months: 5 - i });
      const slotYear = dt.year;
      const slotMonth = dt.month;
      const isCurrent = slotYear === year && slotMonth === month;
      if (isCurrent) {
        return {
          year: slotYear,
          month: slotMonth,
          label: growthLabel(slotYear, slotMonth),
          gross: sumGrossCents(currentMonthDocs) / 100,
          documents_count: countInvoices(currentMonthDocs),
        };
      }
      const cached = cacheByYear.get(slotYear)?.get(slotMonth);
      return {
        year: slotYear,
        month: slotMonth,
        label: growthLabel(slotYear, slotMonth),
        gross: (cached?.gross_cents ?? 0) / 100,
        documents_count: cached?.documents_count ?? 0,
      };
    });

    // Previous month comparison
    const prevDt = DateTime.fromObject({ year, month, day: 1 }, { zone: LISBON }).minus({ months: 1 });
    const pmYear = prevDt.year;
    const pmMonth = prevDt.month;
    const pmDays = prevDt.daysInMonth ?? 30;
    let prevMonth: AnalyticsHistoricalResponse["comparisons"]["prev_month"] = null;
    if (pmYear >= this.historyStartYear) {
      const cached = cacheByYear.get(pmYear)?.get(pmMonth);
      const pmGross = cached?.gross_cents ?? 0;
      const pmCount = cached?.documents_count ?? 0;
      prevMonth = {
        year: pmYear,
        month: pmMonth,
        label: growthLabel(pmYear, pmMonth),
        gross: pmGross / 100,
        daily_avg: pmDays > 0 ? Math.round(pmGross / pmDays) / 100 : 0,
        avg_ticket: pmCount > 0 ? Math.round(pmGross / pmCount) / 100 : 0,
        documents_count: pmCount,
      };
    }

    // Prev year YTD
    const prevYear = year - 1;
    const prevYearMap = cacheByYear.get(prevYear);
    let prevYearYtd: AnalyticsHistoricalResponse["comparisons"]["prev_year_ytd"] = null;
    if (prevYearMap) {
      let pyGross = 0;
      let pyCount = 0;
      for (let m = 1; m <= month; m++) {
        const row = prevYearMap.get(m);
        if (row) { pyGross += row.gross_cents; pyCount += row.documents_count; }
      }
      prevYearYtd = { year: prevYear, gross: pyGross / 100, documents_count: pyCount };
    }

    return {
      annual: { gross: annualGrossCents / 100, year, documents_count: annualCount },
      historical: {
        gross: historicalGrossCents / 100,
        since: `${this.historyStartYear}-01-01`,
        documents_count: historicalCount,
      },
      monthly_growth: slots,
      comparisons: { prev_month: prevMonth, prev_year_ytd: prevYearYtd },
      debug: { took_ms: Date.now() - startedAt, history_start_year: this.historyStartYear },
    };
  }
}
