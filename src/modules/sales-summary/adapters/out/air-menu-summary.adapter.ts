import { DateTime } from "luxon";
import type {
  AirMenuSummaryPort,
  AirMenuSummaryData,
  AirMenuSourcePlatform,
  AirMenuChannelData,
} from "../../domain/ports/out/air-menu-summary.port.js";
import type { GetSummaryPort } from "../../../air-menu/domain/ports/in/get-summary.port.js";
import { normalizeProductTitle } from "../../../vendus/domain/services/product-title-normalizer.js";

function mapPlatform(platform: string): AirMenuSourcePlatform | null {
  const p = platform.toLowerCase().trim();
  if (p.includes("uber")) return "uber_eats";
  if (p.includes("glovo")) return "glovo";
  if (p.includes("bolt")) return "bolt_food";
  return null;
}

/**
 * Bridges the air-menu module's GetSummaryPort → sales-summary's AirMenuSummaryPort.
 *
 * Key mapping decisions:
 * - Totals and per-channel breakdown computed from raw orders.
 * - byCategory from analytics (CategoryStats with nested subcategories — only
 *   parent category names are passed through; the calculator maps to Unified).
 * - Hourly temporal computed from order.documentDate.getHours().
 * - Product titles normalized with the same normalizer used by vendus, so
 *   deduplication in the calculator matches across both sources.
 */
export class AirMenuSummaryAdapter implements AirMenuSummaryPort {
  constructor(
    private readonly airMenuGetSummary: GetSummaryPort,
    private readonly enterpriseId: string,
  ) {}

  async getSummary(year: number, month: number): Promise<AirMenuSummaryData> {
    const zone = "Europe/Lisbon";
    const startDate = DateTime.fromObject({ year, month, day: 1 }, { zone }).startOf("day").toJSDate();
    const endDate = DateTime.fromObject({ year, month, day: 1 }, { zone }).endOf("month").toJSDate();

    const { orders, analytics } = await this.airMenuGetSummary.execute(
      this.enterpriseId,
      startDate,
      endDate,
    );

    // ─── Totals from orders ───────────────────────────────────────────────────

    let faturadoTotalCents = 0;
    let invoiceCount = 0;
    let creditNoteCount = 0;
    let creditNoteValueCents = 0;

    for (const order of orders) {
      const grossCents = Math.round(Math.abs(order.total) * 100);
      if (order.documentType === "invoice") {
        faturadoTotalCents += grossCents;
        invoiceCount++;
      } else {
        creditNoteValueCents += grossCents;
        creditNoteCount++;
      }
    }

    const invoiceVatCollectedCents = Math.round(analytics.summary.vatCollected * 100);

    // ─── By channel (from orders, grouped by platform) ────────────────────────

    const platformAcc = new Map<AirMenuSourcePlatform, {
      invoiceCount: number;
      creditNoteCount: number;
      invoiceGrossCents: number;
      creditNoteValueCents: number;
    }>();

    for (const order of orders) {
      const platform = mapPlatform(order.platform);
      if (!platform) continue;
      const acc = platformAcc.get(platform) ?? {
        invoiceCount: 0,
        creditNoteCount: 0,
        invoiceGrossCents: 0,
        creditNoteValueCents: 0,
      };
      const grossCents = Math.round(Math.abs(order.total) * 100);
      if (order.documentType === "invoice") {
        acc.invoiceCount++;
        acc.invoiceGrossCents += grossCents;
      } else {
        acc.creditNoteCount++;
        acc.creditNoteValueCents += grossCents;
      }
      platformAcc.set(platform, acc);
    }

    const byChannel: AirMenuChannelData[] = Array.from(platformAcc.entries()).map(([channel, acc]) => ({
      channel,
      grossRevenueCents: acc.invoiceGrossCents - acc.creditNoteValueCents,
      invoiceCount: acc.invoiceCount,
      creditNoteCount: acc.creditNoteCount,
      creditNoteValueCents: acc.creditNoteValueCents,
    }));

    // ─── By category (from analytics parent categories) ───────────────────────

    const byCategory = analytics.byCategory.map((cat) => ({
      category: cat.category, // raw AirMenu name; calculator maps to Unified
      itemsSold: cat.itemsSold,
      grossRevenueCents: Math.round(cat.grossRevenue * 100),
      vatCollectedCents: Math.round(cat.vatCollected * 100),
      netRevenueCents: Math.round(cat.netRevenue * 100),
    }));

    // ─── Top products (channels tracked from invoice orders) ──────────────────

    const productChannelMap = new Map<string, Set<AirMenuSourcePlatform>>();
    for (const order of orders) {
      if (order.documentType !== "invoice") continue;
      const platform = mapPlatform(order.platform);
      if (!platform) continue;
      for (const item of order.items) {
        const key = normalizeProductTitle(item.title).toLowerCase().trim();
        const platforms = productChannelMap.get(key) ?? new Set<AirMenuSourcePlatform>();
        platforms.add(platform);
        productChannelMap.set(key, platforms);
      }
    }

    const topProducts = analytics.topItems.map((item) => {
      const normalizedTitle = normalizeProductTitle(item.title);
      const key = normalizedTitle.toLowerCase().trim();
      return {
        normalizedTitle,
        quantitySold: item.quantitySold,
        grossRevenueCents: Math.round(item.grossRevenue * 100),
        channelsSeen: Array.from(productChannelMap.get(key) ?? []),
      };
    });

    // ─── Temporal distribution (hourly from order.documentDate) ───────────────

    const hourMap = new Map<number, {
      invoiceCount: number;
      creditNoteCount: number;
      grossRevenueCents: number;
    }>();
    for (let h = 0; h < 24; h++) {
      hourMap.set(h, { invoiceCount: 0, creditNoteCount: 0, grossRevenueCents: 0 });
    }

    for (const order of orders) {
      const hour = order.documentDate.getHours();
      const bucket = hourMap.get(hour);
      if (!bucket) continue;
      const grossCents = Math.round(Math.abs(order.total) * 100);
      if (order.documentType === "invoice") {
        bucket.invoiceCount++;
        bucket.grossRevenueCents += grossCents;
      } else {
        bucket.creditNoteCount++;
        bucket.grossRevenueCents -= grossCents;
      }
    }

    const temporalDistribution = Array.from(hourMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, data]) => ({ hour, ...data }));

    return {
      faturadoTotalCents,
      invoiceVatCollectedCents,
      invoiceCount,
      creditNoteCount,
      creditNoteValueCents,
      byChannel,
      byCategory,
      topProducts,
      temporalDistribution,
    };
  }
}
