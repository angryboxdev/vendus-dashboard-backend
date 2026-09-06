import { DateTime } from "luxon";
import type { VendusSummaryPort, VendusSummaryData, VendusSourceChannel, VendusSourceCategory } from "../../domain/ports/out/vendus-summary.port.js";
import type { GetSummaryPort } from "../../../vendus/domain/ports/in/get-summary.port.js";

/**
 * Bridges the vendus module's GetSummaryPort → sales-summary's VendusSummaryPort.
 *
 * Key mapping decisions:
 * - faturadoTotalCents / creditNoteValueCents computed from ALL documents
 *   (including same-period cancelled pairs) to match the spec's "before NC
 *   subtraction" intent.
 * - byChannel separates take_away from salao (vendus analytics merges them).
 * - Hourly temporal computed from documents' system_time (analytics uses
 *   daily buckets for multi-day periods).
 * - byCategory and topProducts use analytics (computed on filtered docs).
 */
export class VendusSummaryAdapter implements VendusSummaryPort {
  constructor(private readonly vendusGetSummary: GetSummaryPort) {}

  async getSummary(year: number, month: number): Promise<VendusSummaryData> {
    const zone = "Europe/Lisbon";
    const since = DateTime.fromObject({ year, month, day: 1 }, { zone }).toISODate()!;
    const until = DateTime.fromObject({ year, month, day: 1 }, { zone })
      .endOf("month")
      .toISODate()!;

    const { documents, analytics } = await this.vendusGetSummary.execute({ since, until });

    // ─── Totals from all documents ────────────────────────────────────────────

    let faturadoTotalCents = 0;
    let invoiceCount = 0;
    let creditNoteCount = 0;
    let creditNoteValueCents = 0;

    for (const doc of documents) {
      const gross = Math.round(parseFloat(doc.amount_gross) * 100);
      if (doc.type === "FS" || doc.type === "FT") {
        faturadoTotalCents += gross;
        invoiceCount++;
      } else if (doc.type === "NC") {
        creditNoteValueCents += gross;
        creditNoteCount++;
      }
    }

    const invoiceVatCollectedCents = Math.round(analytics.summary.vatCollected * 100);

    // ─── By channel (from documents, preserving take_away as separate channel) ─

    const channelAccumulator = new Map<VendusSourceChannel, {
      invoiceCount: number;
      creditNoteCount: number;
      invoiceGrossCents: number;
      creditNoteValueCents: number;
    }>();
    for (const ch of ["salao", "take_away", "eatz", "apps"] as VendusSourceChannel[]) {
      channelAccumulator.set(ch, {
        invoiceCount: 0,
        creditNoteCount: 0,
        invoiceGrossCents: 0,
        creditNoteValueCents: 0,
      });
    }

    for (const doc of documents) {
      const ch = doc.channel as VendusSourceChannel;
      const acc = channelAccumulator.get(ch);
      if (!acc) continue;
      const gross = Math.round(parseFloat(doc.amount_gross) * 100);
      if (doc.type === "FS" || doc.type === "FT") {
        acc.invoiceCount++;
        acc.invoiceGrossCents += gross;
      } else if (doc.type === "NC") {
        acc.creditNoteCount++;
        acc.creditNoteValueCents += gross;
      }
    }

    const byChannel = Array.from(channelAccumulator.entries()).map(([channel, acc]) => ({
      channel,
      grossRevenueCents: acc.invoiceGrossCents - acc.creditNoteValueCents,
      invoiceCount: acc.invoiceCount,
      creditNoteCount: acc.creditNoteCount,
      creditNoteValueCents: acc.creditNoteValueCents,
    }));

    // ─── By category (from analytics — filtered docs) ─────────────────────────

    const byCategory = analytics.byCategory.map((cat) => ({
      category: cat.category as VendusSourceCategory,
      itemsSold: cat.quantitySold,
      grossRevenueCents: Math.round(cat.grossRevenue * 100),
      vatCollectedCents: Math.round(cat.vatCollected * 100),
      netRevenueCents: Math.round(cat.netRevenue * 100),
    }));

    // ─── Top products (all products from productsByChannel) ───────────────────

    const topProducts = analytics.productsByChannel.map((product) => {
      const channelsSeen: VendusSourceChannel[] = [];
      if (product.byChannel.salao > 0) channelsSeen.push("salao");
      if (product.byChannel.take_away > 0) channelsSeen.push("take_away");
      if (product.byChannel.eatz > 0) channelsSeen.push("eatz");
      if (product.byChannel.apps > 0) channelsSeen.push("apps");
      return {
        normalizedTitle: product.title, // already normalized by vendus
        category: product.category as VendusSourceCategory,
        quantitySold: product.quantitySold,
        grossRevenueCents: Math.round(product.grossRevenue * 100),
        channelsSeen,
      };
    });

    // ─── Temporal distribution (hourly from documents' system_time) ───────────

    const hourMap = new Map<number, {
      invoiceCount: number;
      creditNoteCount: number;
      grossRevenueCents: number;
    }>();
    for (let h = 0; h < 24; h++) {
      hourMap.set(h, { invoiceCount: 0, creditNoteCount: 0, grossRevenueCents: 0 });
    }

    for (const doc of documents) {
      const hour = new Date(doc.system_time).getHours();
      const bucket = hourMap.get(hour);
      if (!bucket) continue;
      const gross = Math.round(parseFloat(doc.amount_gross) * 100);
      if (doc.type === "FS" || doc.type === "FT") {
        bucket.invoiceCount++;
        bucket.grossRevenueCents += gross;
      } else if (doc.type === "NC") {
        bucket.creditNoteCount++;
        bucket.grossRevenueCents -= gross; // NC reduces hourly revenue
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
