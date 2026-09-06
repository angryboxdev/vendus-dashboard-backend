import type { GetSalesSummaryPort, GetSalesSummaryParams } from "../../domain/ports/in/get-sales-summary.port.js";
import type { SalesSummaryResult, UnifiedChannel } from "../../domain/entities/sales-summary.js";
import type { VendusSummaryPort } from "../../domain/ports/out/vendus-summary.port.js";
import type { AirMenuSummaryPort } from "../../domain/ports/out/air-menu-summary.port.js";
import type { SalesSummaryCachePort } from "../../domain/ports/out/sales-summary-cache.port.js";
import type { SalesSummaryCalculatorService } from "../../domain/services/sales-summary-calculator.service.js";

const TTL_MS = 15 * 60 * 1000; // 15 minutes

const VENDUS_CHANNELS = new Set<UnifiedChannel>(["salao", "take_away", "eatz", "apps"]);
const AIRMENU_CHANNELS = new Set<UnifiedChannel>(["uber_eats", "glovo", "bolt_food"]);

export class GetSalesSummaryUseCase implements GetSalesSummaryPort {
  constructor(
    private readonly vendus: VendusSummaryPort,
    private readonly airMenu: AirMenuSummaryPort,
    private readonly cache: SalesSummaryCachePort,
    private readonly calculator: SalesSummaryCalculatorService,
  ) {}

  async execute(params: GetSalesSummaryParams): Promise<SalesSummaryResult> {
    const { organizationId, year, month, forceRefresh } = params;

    // ─── Cache check ──────────────────────────────────────────────────────────

    if (!forceRefresh) {
      const cached = await this.cache.get(organizationId, year, month);
      if (cached) {
        const now = new Date();
        if (this.isPastMonth(year, month, now)) {
          return { ...cached.payload, cachedAt: cached.calculatedAt };
        }
        // Current month — apply TTL
        if (now.getTime() - cached.calculatedAt.getTime() < TTL_MS) {
          return { ...cached.payload, cachedAt: cached.calculatedAt };
        }
      }
    }

    // ─── Live calculation ─────────────────────────────────────────────────────

    const [vendusData, airMenuData] = await Promise.all([
      this.vendus.getSummary(year, month),
      this.airMenu.getSummary(year, month),
    ]);

    const cachedAt = new Date();
    const result = this.calculator.calculate(vendusData, airMenuData, year, month, cachedAt);

    const vendusRevenueCents = result.byChannel
      .filter((c) => VENDUS_CHANNELS.has(c.channel))
      .reduce((sum, c) => sum + c.grossRevenue, 0);

    const airMenuRevenueCents = result.byChannel
      .filter((c) => AIRMENU_CHANNELS.has(c.channel))
      .reduce((sum, c) => sum + c.grossRevenue, 0);

    await this.cache.save(organizationId, year, month, {
      payload: result,
      vendusRevenueCents,
      airMenuRevenueCents,
    });

    return result;
  }

  private isPastMonth(year: number, month: number, now: Date): boolean {
    const cy = now.getFullYear();
    const cm = now.getMonth() + 1;
    return year < cy || (year === cy && month < cm);
  }
}
