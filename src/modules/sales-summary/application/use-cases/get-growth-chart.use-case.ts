import type { GetGrowthChartPort, GetGrowthChartParams } from "../../domain/ports/in/get-growth-chart.port.js";
import type { MonthlyGrowthPoint, UnifiedChannel } from "../../domain/entities/sales-summary.js";
import type { SalesSummaryCachePort } from "../../domain/ports/out/sales-summary-cache.port.js";
import type { GetSalesSummaryPort } from "../../domain/ports/in/get-sales-summary.port.js";

const VENDUS_CHANNELS = new Set<UnifiedChannel>(["salao", "take_away", "eatz", "apps"]);
const AIRMENU_CHANNELS = new Set<UnifiedChannel>(["uber_eats", "glovo", "bolt_food"]);
const TTL_MS = 15 * 60 * 1000;

export class GetGrowthChartUseCase implements GetGrowthChartPort {
  constructor(
    private readonly cache: SalesSummaryCachePort,
    private readonly getSalesSummary: GetSalesSummaryPort,
  ) {}

  async execute(params: GetGrowthChartParams): Promise<MonthlyGrowthPoint[]> {
    const { organizationId, year } = params;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Seed from existing cache rows (light read — no payload deserialization)
    const cachedMonths = await this.cache.getYearMonths(organizationId, year);
    const cacheMap = new Map<number, (typeof cachedMonths)[number]>();
    for (const row of cachedMonths) cacheMap.set(row.month, row);

    const result: MonthlyGrowthPoint[] = [];

    for (let month = 1; month <= 12; month++) {
      const isFuture =
        year > currentYear || (year === currentYear && month > currentMonth);

      if (isFuture) {
        result.push({ year, month, vendusRevenue: 0, airMenuRevenue: 0, totalRevenue: 0, cachedAt: null });
        continue;
      }

      const cached = cacheMap.get(month);
      const isCurrentMonth = year === currentYear && month === currentMonth;
      const isFresh = cached && (!isCurrentMonth || now.getTime() - cached.calculatedAt.getTime() < TTL_MS);
      if (isFresh) {
        result.push({
          year,
          month,
          vendusRevenue: cached.vendusRevenueCents,
          airMenuRevenue: cached.airMenuRevenueCents,
          totalRevenue: cached.totalRevenueCents,
          cachedAt: cached.calculatedAt,
        });
        continue;
      }

      // Not in cache — calculate sequentially, save to cache (inside use case), then extract
      try {
        const summary = await this.getSalesSummary.execute({
          organizationId,
          year,
          month,
          forceRefresh: false,
        });

        const vendusRevenue = summary.byChannel
          .filter((c) => VENDUS_CHANNELS.has(c.channel))
          .reduce((s, c) => s + c.grossRevenue, 0);

        const airMenuRevenue = summary.byChannel
          .filter((c) => AIRMENU_CHANNELS.has(c.channel))
          .reduce((s, c) => s + c.grossRevenue, 0);

        result.push({
          year,
          month,
          vendusRevenue,
          airMenuRevenue,
          totalRevenue: summary.totals.grossRevenue,
          cachedAt: summary.cachedAt,
        });
      } catch {
        // Missing month that failed calculation — documented cold-start risk (ADR-0013)
        result.push({ year, month, vendusRevenue: 0, airMenuRevenue: 0, totalRevenue: 0, cachedAt: null });
      }
    }

    return result;
  }
}
