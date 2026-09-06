import type { VendusSummaryData, VendusSourceCategory } from "../ports/out/vendus-summary.port.js";
import type { AirMenuSummaryData } from "../ports/out/air-menu-summary.port.js";
import type {
  SalesSummaryResult,
  ChannelSummary,
  CategorySummary,
  ProductRanking,
  TimeBucket,
  UnifiedChannel,
  UnifiedCategory,
} from "../entities/sales-summary.js";

// ─── Category mapping ─────────────────────────────────────────────────────────

const VENDUS_CATEGORY_MAP: Record<VendusSourceCategory, UnifiedCategory> = {
  pizza: "Pizzas",
  bebida_alcoolica: "Bebidas Alcoólicas",
  bebida_nao_alcoolica: "Bebidas",
  sacos: "Outros",
  outros: "Outros",
};

/**
 * Maps AirMenu parent category names to Unified Categories.
 * AirMenu "Drinks" → "Bebidas" is a known approximation (ADR-0011).
 */
function mapAirMenuCategory(category: string): UnifiedCategory {
  const n = category.trim().toLowerCase();
  if (n === "pizzas" || n === "pizza") return "Pizzas";
  if (n === "drinks" || n === "bebidas") return "Bebidas";
  if (n === "outros" || n === "other" || n === "others") return "Outros";
  // Unknown AirMenu categories fall into Outros
  return "Outros";
}

// ─── Channel helpers ──────────────────────────────────────────────────────────

const CANONICAL_CHANNELS: UnifiedChannel[] = [
  "salao", "take_away", "eatz", "uber_eats", "glovo", "bolt_food",
];

const VENDUS_UNIFIED_CHANNELS = new Set<UnifiedChannel>(["salao", "take_away", "eatz", "apps"]);
const AIRMENU_UNIFIED_CHANNELS = new Set<UnifiedChannel>(["uber_eats", "glovo", "bolt_food"]);

// ─── Calculator service ───────────────────────────────────────────────────────

/**
 * Pure domain service — no I/O. Merges VendusSummaryData and AirMenuSummaryData
 * into a SalesSummaryResult. All merging logic lives here:
 * channel union, NC subtraction, category mapping, product deduplication,
 * temporal bucket merge.
 */
export class SalesSummaryCalculatorService {
  calculate(
    vendus: VendusSummaryData,
    airMenu: AirMenuSummaryData,
    year: number,
    month: number,
    cachedAt: Date,
  ): SalesSummaryResult {
    // ─── Totals ──────────────────────────────────────────────────────────────

    const faturadoTotal = vendus.faturadoTotalCents + airMenu.faturadoTotalCents;
    const creditNoteValue = vendus.creditNoteValueCents + airMenu.creditNoteValueCents;
    const grossRevenue = faturadoTotal - creditNoteValue;
    const vatCollected = vendus.invoiceVatCollectedCents + airMenu.invoiceVatCollectedCents;
    const netRevenue = grossRevenue - vatCollected;
    const transactionCount = vendus.invoiceCount + airMenu.invoiceCount;
    const averageTicket = transactionCount > 0
      ? Math.round(grossRevenue / transactionCount)
      : 0;
    const creditNoteCount = vendus.creditNoteCount + airMenu.creditNoteCount;

    // ─── By channel ──────────────────────────────────────────────────────────

    const channelGross = new Map<UnifiedChannel, number>();
    const channelCount = new Map<UnifiedChannel, number>();

    for (const ch of vendus.byChannel) {
      channelGross.set(ch.channel as UnifiedChannel, (channelGross.get(ch.channel as UnifiedChannel) ?? 0) + ch.grossRevenueCents);
      channelCount.set(ch.channel as UnifiedChannel, (channelCount.get(ch.channel as UnifiedChannel) ?? 0) + ch.invoiceCount);
    }
    for (const ch of airMenu.byChannel) {
      channelGross.set(ch.channel as UnifiedChannel, (channelGross.get(ch.channel as UnifiedChannel) ?? 0) + ch.grossRevenueCents);
      channelCount.set(ch.channel as UnifiedChannel, (channelCount.get(ch.channel as UnifiedChannel) ?? 0) + ch.invoiceCount);
    }

    // 6 canonical channels always present; 'apps' added when vendus has data for it
    const hasApps = vendus.byChannel.some(
      (c) => c.channel === "apps" && (c.invoiceCount + c.creditNoteCount) > 0,
    );
    const channelNames: UnifiedChannel[] = [...CANONICAL_CHANNELS];
    if (hasApps) channelNames.push("apps");

    const byChannelRaw = channelNames.map((name) => {
      const gross = channelGross.get(name) ?? 0;
      const count = channelCount.get(name) ?? 0;
      return {
        channel: name,
        grossRevenue: gross,
        transactionCount: count,
        averageTicket: count > 0 ? Math.round(gross / count) : 0,
        sharePercent: 0,
      };
    });

    const totalForShare = byChannelRaw.reduce((s, c) => s + c.grossRevenue, 0);
    const byChannel: ChannelSummary[] = byChannelRaw.map((c) => ({
      ...c,
      sharePercent: totalForShare > 0
        ? Math.round((c.grossRevenue / totalForShare) * 10000) / 100
        : 0,
    }));

    // ─── By category ─────────────────────────────────────────────────────────

    const catAcc = new Map<UnifiedCategory, {
      itemsSold: number;
      grossRevenueCents: number;
      vatCollectedCents: number;
      netRevenueCents: number;
    }>();
    for (const cat of ["Pizzas", "Bebidas Alcoólicas", "Bebidas", "Outros"] as UnifiedCategory[]) {
      catAcc.set(cat, { itemsSold: 0, grossRevenueCents: 0, vatCollectedCents: 0, netRevenueCents: 0 });
    }

    for (const vc of vendus.byCategory) {
      const unified = VENDUS_CATEGORY_MAP[vc.category];
      const acc = catAcc.get(unified)!;
      acc.itemsSold += vc.itemsSold;
      acc.grossRevenueCents += vc.grossRevenueCents;
      acc.vatCollectedCents += vc.vatCollectedCents;
      acc.netRevenueCents += vc.netRevenueCents;
    }
    for (const ac of airMenu.byCategory) {
      const unified = mapAirMenuCategory(ac.category);
      const acc = catAcc.get(unified)!;
      acc.itemsSold += ac.itemsSold;
      acc.grossRevenueCents += ac.grossRevenueCents;
      acc.vatCollectedCents += ac.vatCollectedCents;
      acc.netRevenueCents += ac.netRevenueCents;
    }

    const byCategory: CategorySummary[] = Array.from(catAcc.entries()).map(([category, acc]) => ({
      category,
      itemsSold: acc.itemsSold,
      grossRevenue: acc.grossRevenueCents,
      vatCollected: acc.vatCollectedCents,
      netRevenue: acc.netRevenueCents,
    }));

    // ─── Top products (deduplication by normalized title) ─────────────────────

    const productMap = new Map<string, {
      normalizedTitle: string;
      quantitySold: number;
      grossRevenueCents: number;
      channels: Set<UnifiedChannel>;
    }>();

    function addProduct(
      normalizedTitle: string,
      quantitySold: number,
      grossRevenueCents: number,
      channels: UnifiedChannel[],
    ): void {
      const key = normalizedTitle.toLowerCase().trim();
      const existing = productMap.get(key);
      if (existing) {
        existing.quantitySold += quantitySold;
        existing.grossRevenueCents += grossRevenueCents;
        for (const ch of channels) existing.channels.add(ch);
      } else {
        productMap.set(key, {
          normalizedTitle,
          quantitySold,
          grossRevenueCents,
          channels: new Set(channels),
        });
      }
    }

    for (const vp of vendus.topProducts) {
      // VendusSourceChannel is a strict subtype of UnifiedChannel — cast is safe
      addProduct(
        vp.normalizedTitle,
        vp.quantitySold,
        vp.grossRevenueCents,
        vp.channelsSeen as UnifiedChannel[],
      );
    }
    for (const ap of airMenu.topProducts) {
      // AirMenuSourcePlatform is a strict subtype of UnifiedChannel — cast is safe
      addProduct(
        ap.normalizedTitle,
        ap.quantitySold,
        ap.grossRevenueCents,
        ap.channelsSeen as UnifiedChannel[],
      );
    }

    const topProducts: ProductRanking[] = Array.from(productMap.values())
      .sort((a, b) => b.grossRevenueCents - a.grossRevenueCents)
      .slice(0, 50)
      .map(({ normalizedTitle, quantitySold, grossRevenueCents, channels }) => ({
        normalizedTitle,
        quantitySold,
        grossRevenue: grossRevenueCents,
        channels: Array.from(channels),
      }));

    // ─── Temporal distribution ────────────────────────────────────────────────

    const hourMap = new Map<number, { invoiceCount: number; creditNoteCount: number; grossRevenueCents: number }>();
    for (let h = 0; h < 24; h++) {
      hourMap.set(h, { invoiceCount: 0, creditNoteCount: 0, grossRevenueCents: 0 });
    }

    for (const vt of vendus.temporalDistribution) {
      const b = hourMap.get(vt.hour)!;
      b.invoiceCount += vt.invoiceCount;
      b.creditNoteCount += vt.creditNoteCount;
      b.grossRevenueCents += vt.grossRevenueCents;
    }
    for (const at of airMenu.temporalDistribution) {
      const b = hourMap.get(at.hour)!;
      b.invoiceCount += at.invoiceCount;
      b.creditNoteCount += at.creditNoteCount;
      b.grossRevenueCents += at.grossRevenueCents;
    }

    const temporalDistribution: TimeBucket[] = Array.from(hourMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, data]) => ({
        hour,
        invoiceCount: data.invoiceCount,
        creditNoteCount: data.creditNoteCount,
        grossRevenue: data.grossRevenueCents,
      }));

    // ─── Result ───────────────────────────────────────────────────────────────

    return {
      period: { year, month },
      cachedAt,
      totals: {
        grossRevenue,
        faturadoTotal,
        vatCollected,
        netRevenue,
        transactionCount,
        averageTicket,
        creditNoteCount,
        creditNoteValue,
      },
      byChannel,
      byCategory,
      topProducts,
      temporalDistribution,
    };
  }
}
