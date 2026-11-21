import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  ALL_CHANNELS, AIRMENU_CHANNELS, VENDUS_CHANNELS, SalesAnalysisValidationError, compact,
  type AirMenuMonthStatus, type DateRange, type IsoDate, type SalesAnalysisData, type SalesBucket,
  type SalesChannel, type SalesForecast, type SalesSource, type SourceSelection,
} from "../../domain/entities/sales-analysis.js";
import type { FetchAirMenuMonthPort, GetSalesAnalysisPort, GetSalesForecastPort } from "../../domain/ports/in/sales-analysis.ports.js";
import type { ClockPort, ForecastModelPort, SalesBucketStorePort, VendusSalesSourcePort } from "../../domain/ports/out/sales-analysis.ports.js";
import { dailyByChannel, dailyTotals } from "../../domain/services/buckets.service.js";
import { addDays, dayCount, eachDay, intersect, isIsoDate, monthOf, monthRange, monthsOf, shiftRange, shiftYear } from "../../domain/services/dates.js";
import { baselineForecast, buildForecastPrompt, parseForecastResponse, remainingDates, type DailyPoint, type ForecastInput } from "../../domain/services/forecast.service.js";
import type { AirMenuFetchCoordinator, VendusFillCoordinator } from "../background-fills.js";

export const MAX_RANGE_DAYS = 366;
const TODAY_TTL_MS = 5 * 60_000;

function sourcesOf(sel: SourceSelection): SalesSource[] {
  return sel === "both" ? ["vendus", "airmenu"] : [sel];
}

function channelsOf(sel: SourceSelection): SalesChannel[] {
  if (sel === "vendus") return [...VENDUS_CHANNELS];
  if (sel === "airmenu") return [...AIRMENU_CHANNELS];
  return [...ALL_CHANNELS];
}

export function validateRange(range: DateRange, today: IsoDate): void {
  if (!isIsoDate(range.from) || !isIsoDate(range.to)) throw new SalesAnalysisValidationError("Datas inválidas (AAAA-MM-DD).");
  if (range.from > range.to) throw new SalesAnalysisValidationError("A data inicial é posterior à final.");
  if (range.to > today) throw new SalesAnalysisValidationError("O período não pode terminar depois de hoje.");
  if (dayCount(range) > MAX_RANGE_DAYS) throw new SalesAnalysisValidationError("O período máximo é de 12 meses.");
}

/**
 * Vendas de hoje da Vendus, em direto, com cache curta (5 min) por organização,
 * para não repetir o pedido a cada abertura da página.
 */
export class TodayVendusCache {
  private readonly cache = new Map<string, { date: IsoDate; at: number; buckets: SalesBucket[] }>();
  constructor(private readonly vendus: VendusSalesSourcePort, private readonly now: () => number = Date.now) {}

  async get(org: OrganizationId, today: IsoDate): Promise<SalesBucket[] | null> {
    const hit = this.cache.get(org);
    if (hit && hit.date === today && this.now() - hit.at < TODAY_TTL_MS) return hit.buckets;
    try {
      const buckets = await this.vendus.fetchBuckets({ from: today, to: today });
      this.cache.set(org, { date: today, at: this.now(), buckets });
      return buckets;
    } catch (e) {
      console.error("[sales-analysis] Vendus today failed:", e);
      return hit && hit.date === today ? hit.buckets : null;
    }
  }
}

export class GetSalesAnalysisUseCase implements GetSalesAnalysisPort {
  constructor(
    private readonly store: SalesBucketStorePort,
    private readonly vendusFill: VendusFillCoordinator,
    private readonly todayVendus: TodayVendusCache,
    private readonly airMenuJobs: AirMenuFetchCoordinator,
    private readonly clock: ClockPort,
  ) {}

  async execute({ organizationId: org, range, source }: { organizationId: OrganizationId; range: DateRange; source: SourceSelection }): Promise<SalesAnalysisData> {
    const today = this.clock.today();
    validateRange(range, today);
    const prevYearRange = shiftRange(range, -12);
    const prevMonthRange = shiftRange(range, -1);
    const windows = [range, prevYearRange, prevMonthRange];
    const channels = channelsOf(source);
    const current: SalesBucket[] = [];
    const prevYear: SalesBucket[] = [];
    const prevMonth: SalesBucket[] = [];
    let vendus: SalesAnalysisData["vendus"] = null;
    let airMenu: SalesAnalysisData["airMenu"] = null;

    for (const src of sourcesOf(source)) {
      // Dias fechados guardados para as três janelas.
      const all = await this.loadWindows(org, src, windows);
      const [cur = [], py = [], pm = []] = all;
      current.push(...cur);
      prevYear.push(...py);
      prevMonth.push(...pm);

      if (src === "vendus") {
        const missing = await this.missingClosedDays(org, "vendus", windows, today);
        const fill = this.vendusFill.ensure(org, missing);
        let todayLive: boolean | null = null;
        if (range.to === today) {
          const t = await this.todayVendus.get(org, today);
          todayLive = t !== null;
          if (t) current.push(...t);
        }
        vendus = { missingDays: missing.length, fill, todayLive };
      } else {
        const months: AirMenuMonthStatus[] = [];
        for (const month of monthsOf(range)) months.push(await this.airMenuMonth(org, month, range, today));
        if (range.to === today) current.push(...this.airMenuJobs.todayBuckets(org));
        const comparisonMissingMonths: string[] = [];
        for (const w of [prevYearRange, prevMonthRange]) {
          for (const month of monthsOf(w)) {
            if (comparisonMissingMonths.includes(month) || monthsOf(range).includes(month)) continue;
            const span = intersect(monthRange(month), w)!;
            const covered = await this.store.coveredDays(org, "airmenu", span);
            if (covered.size < dayCount(span)) comparisonMissingMonths.push(month);
          }
        }
        airMenu = { months, comparisonMissingMonths: comparisonMissingMonths.sort() };
      }
    }

    return {
      today,
      source,
      range,
      prevYearRange,
      prevMonthRange,
      channels,
      current: current.filter((b) => b.date >= range.from && b.date <= range.to).map((b) => compact(b, channels)),
      prevYear: dailyByChannel(prevYear).map((b) => compact(b, channels)),
      prevMonth: dailyByChannel(prevMonth).map((b) => compact(b, channels)),
      vendus,
      airMenu,
    };
  }

  private async loadWindows(org: OrganizationId, src: SalesSource, windows: DateRange[]): Promise<SalesBucket[][]> {
    // Uma leitura só, do início da janela mais antiga ao fim da mais recente.
    const from = windows.map((w) => w.from).sort()[0]!;
    const to = windows.map((w) => w.to).sort().reverse()[0]!;
    const rows = await this.store.buckets(org, src, { from, to });
    return windows.map((w) => rows.filter((b) => b.date >= w.from && b.date <= w.to));
  }

  private async missingClosedDays(org: OrganizationId, src: SalesSource, windows: DateRange[], today: IsoDate): Promise<IsoDate[]> {
    const yesterday = addDays(today, -1);
    const needed = new Set<IsoDate>();
    for (const w of windows) {
      const closed = intersect(w, { from: "2000-01-01", to: yesterday });
      if (closed) for (const d of eachDay(closed)) needed.add(d);
    }
    if (needed.size === 0) return [];
    const sorted = [...needed].sort();
    const covered = await this.store.coveredDays(org, src, { from: sorted[0]!, to: sorted[sorted.length - 1]! });
    return sorted.filter((d) => !covered.has(d));
  }

  private async airMenuMonth(org: OrganizationId, month: string, range: DateRange, today: IsoDate): Promise<AirMenuMonthStatus> {
    const job = this.airMenuJobs.status(org, month);
    if (job?.state === "fetching" || job?.state === "queued") return job;
    const span = intersect(intersect(monthRange(month), range)!, { from: "2000-01-01", to: addDays(today, -1) });
    // Mês só com hoje: está «guardado» se já se buscou hoje (fica em memória).
    if (!span) return { month, state: this.airMenuJobs.todayBuckets(org).length ? "stored" : job?.state === "error" ? "error" : "missing", error: job?.error };
    const covered = await this.store.coveredDays(org, "airmenu", span);
    const state = covered.size === 0 ? "missing" : covered.size < dayCount(span) ? "partial" : "stored";
    if (state !== "stored" && job?.state === "error") return job;
    return { month, state };
  }
}

export class FetchAirMenuMonthUseCase implements FetchAirMenuMonthPort {
  constructor(private readonly jobs: AirMenuFetchCoordinator, private readonly clock: ClockPort) {}

  async execute({ organizationId, month }: { organizationId: OrganizationId; month: string }): Promise<AirMenuMonthStatus> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new SalesAnalysisValidationError("Mês inválido (AAAA-MM).");
    if (month > monthOf(this.clock.today())) throw new SalesAnalysisValidationError("Não é possível buscar um mês futuro.");
    return this.jobs.start(organizationId, month);
  }
}

/**
 * Previsão do mês corrente. Calculada uma vez por dia e por fonte (cache em
 * memória). Precisa das últimas 6 semanas guardadas; se faltarem, pede o
 * preenchimento e devolve «pending».
 */
export class GetSalesForecastUseCase implements GetSalesForecastPort {
  private readonly cache = new Map<string, SalesForecast>();

  constructor(
    private readonly store: SalesBucketStorePort,
    private readonly vendusFill: VendusFillCoordinator,
    private readonly model: ForecastModelPort,
    private readonly clock: ClockPort,
  ) {}

  async execute({ organizationId: org, source }: { organizationId: OrganizationId; source: SourceSelection }) {
    const today = this.clock.today();
    const key = `${org}|${source}|${today}`;
    const hit = this.cache.get(key);
    if (hit) return { status: "ready" as const, forecast: hit };

    const yesterday = addDays(today, -1);
    const histRange: DateRange = { from: addDays(today, -42), to: yesterday };
    const lastYearMonth = monthRange(monthOf(shiftYear(today, -1)));
    const monthStart = `${monthOf(today)}-01`;

    if (source !== "airmenu") {
      const need = [...eachDay(histRange), ...eachDay(lastYearMonth)];
      const covered = await this.store.coveredDays(org, "vendus", { from: lastYearMonth.from, to: yesterday });
      const missing = need.filter((d) => !covered.has(d));
      if (missing.length > 0) {
        this.vendusFill.ensure(org, missing);
        return { status: "pending" as const, missingDays: missing.length };
      }
    }

    const buckets: SalesBucket[] = [];
    for (const src of sourcesOf(source)) {
      buckets.push(...(await this.store.buckets(org, src, { from: lastYearMonth.from, to: yesterday })));
    }
    const totals = dailyTotals(buckets);
    const points = (r: DateRange): DailyPoint[] => (r.from <= r.to ? eachDay(r) : []).map((date) => ({ date, grossCents: totals.get(date)?.grossCents ?? 0, count: totals.get(date)?.count ?? 0 }));
    const input: ForecastInput = {
      today,
      targetDates: remainingDates(today),
      history: points(histRange),
      monthToDate: points({ from: monthStart, to: yesterday }),
      sameMonthLastYear: points(lastYearMonth),
    };

    let method: SalesForecast["method"] = "baseline";
    let days = baselineForecast(input);
    let note: string | undefined = "Previsão pela regra simples (mesmo dia da semana nas últimas 6 semanas): a IA não está disponível.";
    if (this.model.available) {
      const parsed = parseForecastResponse(await this.model.complete(buildForecastPrompt(input)), input);
      if (parsed) { method = "ai"; days = parsed.days; note = parsed.note; }
      else note = "A IA não deu uma resposta válida; usada a regra simples (mesmo dia da semana nas últimas 6 semanas).";
    }

    const actualCents = input.monthToDate.reduce((s, p) => s + p.grossCents, 0);
    const sum = (k: "expectedCents" | "lowCents" | "highCents") => days.reduce((s, d) => s + d[k], 0);
    const forecast: SalesForecast = {
      month: monthOf(today),
      generatedAt: new Date().toISOString(),
      method,
      actualCents,
      days,
      expectedTotalCents: actualCents + sum("expectedCents"),
      lowTotalCents: actualCents + sum("lowCents"),
      highTotalCents: actualCents + sum("highCents"),
      note,
    };
    for (const k of this.cache.keys()) if (!k.endsWith(`|${today}`)) this.cache.delete(k);
    this.cache.set(key, forecast);
    return { status: "ready" as const, forecast };
  }
}
