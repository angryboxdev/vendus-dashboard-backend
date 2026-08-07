import type { VendusDetailedDocument } from "../entities/vendus-document.js";
import type { VendusProduct } from "../entities/vendus-product.js";
import type {
  VendusAnalytics,
  VendusSummaryStats,
  VendusChannelStats,
  VendusCategoryStats,
  VendusVatRateStats,
  VendusTopProduct,
  VendusProductChannelBreakdown,
  VendusTemporalPoint,
} from "../entities/vendus-analytics.js";
import type { VendusCategory } from "../entities/vendus-product.js";
import { detectCategory } from "./category-detector.service.js";
import { normalizeProductTitle } from "./product-title-normalizer.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNum(v: string | number | undefined | null): number {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Extrai IVA contido num valor bruto (IVA incluído). */
function extractVat(gross: number, ratePercent: number): number {
  if (ratePercent === 0) return 0;
  return gross - gross / (1 + ratePercent / 100);
}

function isSingleDay(start: Date, end: Date): boolean {
  return (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  );
}

function hourLabel(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

function dayLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Main computation ─────────────────────────────────────────────────────────

/**
 * Computa os analytics completos a partir de documentos detalhados enriquecidos.
 *
 * @param documents Documentos com channel derivado (VendusDetailedDocument[])
 * @param catalog   Map de produtos keyed por reference normalizado
 * @param startDate Início do período (para temporal distribution)
 * @param endDate   Fim do período (para temporal distribution)
 */
export function computeVendusAnalytics(
  documents: VendusDetailedDocument[],
  catalog: Map<string, VendusProduct>,
  startDate: Date,
  endDate: Date,
): VendusAnalytics {
  // Accumulators
  const channelMap = new Map<"salao" | "eatz" | "apps", {
    invoiceCount: number;
    creditNoteCount: number;
    takeAwayCount: number;
    invoiceGross: number;
    totalGross: number;
    vatCents: number;
  }>();
  for (const ch of ["salao", "eatz", "apps"] as const) {
    channelMap.set(ch, { invoiceCount: 0, creditNoteCount: 0, takeAwayCount: 0, invoiceGross: 0, totalGross: 0, vatCents: 0 });
  }

  const categoryMap = new Map<VendusCategory, { quantitySold: number; grossCents: number; vatCents: number }>();
  const vatRateMap = new Map<number, { grossCents: number; vatCents: number }>();
  const topProductMap = new Map<string, VendusTopProduct & { grossCents: number; quantitySold: number; byChannel: { salao: number; take_away: number; eatz: number; apps: number } }>();
  const temporalMap = new Map<string, VendusTemporalPoint>();

  let totalDocuments = 0;
  let totalCreditNotes = 0;
  let invoiceGrossCents = 0;
  let creditNoteGrossCents = 0;
  let invoiceVatCents = 0;

  const singleDay = isSingleDay(startDate, endDate);

  // Pre-populate temporal buckets (full axis even with no data)
  if (singleDay) {
    for (let h = 0; h < 24; h++) {
      const label = `${String(h).padStart(2, "0")}:00`;
      temporalMap.set(label, { period: label, documentCount: 0, grossRevenue: 0 });
    }
  } else {
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const label = dayLabel(cursor);
      temporalMap.set(label, { period: label, documentCount: 0, grossRevenue: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const doc of documents) {
    const isInvoice = doc.type === "FS" || doc.type === "FT";
    const isNC = doc.type === "NC";
    const docGross = toNum(doc.amount_gross);
    const docNet = toNum(doc.amount_net);
    const docVat = docGross - docNet;

    // Summary totals
    if (isInvoice) {
      totalDocuments++;
      invoiceGrossCents += Math.round(docGross * 100);
      invoiceVatCents += Math.round(docVat * 100);
    } else if (isNC) {
      totalCreditNotes++;
      creditNoteGrossCents += Math.round(docGross * 100);
    }

    // Channel (take_away → salao; apps stays as apps)
    const displayChannel = doc.channel === "eatz" ? "eatz" : doc.channel === "apps" ? "apps" : "salao";
    const chAcc = channelMap.get(displayChannel)!;
    if (isInvoice) {
      chAcc.invoiceCount++;
      chAcc.invoiceGross += docGross;
      chAcc.vatCents += Math.round(docVat * 100);
      if (doc.channel === "take_away") chAcc.takeAwayCount++;
    } else if (isNC) {
      chAcc.creditNoteCount++;
    }
    // NC reduces channel gross
    const sign = isInvoice ? 1 : isNC ? -1 : 0;
    chAcc.totalGross += docGross * sign;

    // Temporal
    const docDate = new Date(doc.date);
    const periodKey = singleDay ? hourLabel(new Date(doc.system_time)) : dayLabel(docDate);
    const temporal = temporalMap.get(periodKey);
    if (temporal) {
      if (isInvoice) temporal.documentCount++;
      temporal.grossRevenue += round2(docGross * sign);
    }

    // VAT breakdown — use document-level taxes (fiscally accurate, includes doc-level discounts)
    for (const tax of doc.taxes) {
      const rate = Number(tax.rate);
      const grossAmount = toNum(tax.total) * sign;
      const vatAmount = toNum(tax.amount) * sign;
      const vatAcc = vatRateMap.get(rate) ?? { grossCents: 0, vatCents: 0 };
      vatAcc.grossCents += Math.round(grossAmount * 100);
      vatAcc.vatCents += Math.round(vatAmount * 100);
      vatRateMap.set(rate, vatAcc);
    }

    // Items (category, topProducts)
    for (const item of doc.items) {
      const qty = Number(item.qty) || 0;
      if (qty === 0) continue;

      const rawGrossTotal = toNum(item.amounts?.gross_total);
      const itemGross = rawGrossTotal * sign;
      const vatRate = Number(item.tax?.rate ?? 0);
      const itemVat = extractVat(itemGross, vatRate);
      const itemQty = qty * sign;

      // Category
      const category = detectCategory(
        { reference: item.reference, title: item.title },
        catalog,
      );
      const catAcc = categoryMap.get(category) ?? { quantitySold: 0, grossCents: 0, vatCents: 0 };
      catAcc.quantitySold += itemQty;
      catAcc.grossCents += Math.round(itemGross * 100);
      catAcc.vatCents += Math.round(itemVat * 100);
      categoryMap.set(category, catAcc);

      // VAT rate is computed from doc.taxes below (more accurate than item-level)

      // Top products (keyed by reference or title fallback)
      const productKey = item.reference.trim() || `title:${item.title}`;
      const displayTitle = normalizeProductTitle(item.title);
      const existing = topProductMap.get(productKey);
      if (existing) {
        existing.quantitySold += itemQty;
        existing.grossCents += Math.round(itemGross * 100);
        existing.byChannel[doc.channel] += itemQty;
      } else {
        topProductMap.set(productKey, {
          reference: item.reference,
          title: displayTitle,
          category,
          vatRate,
          quantitySold: itemQty,
          grossRevenue: 0,
          grossCents: Math.round(itemGross * 100),
          byChannel: { salao: 0, take_away: 0, eatz: 0, apps: 0, [doc.channel]: itemQty },
        });
      }
    }
  }

  // Build summary
  const summaryGrossCents = invoiceGrossCents - creditNoteGrossCents;
  const summaryVatCents = invoiceVatCents; // VAT only on invoices
  const summary: VendusSummaryStats = {
    totalDocuments,
    totalCreditNotes,
    grossRevenue: round2(summaryGrossCents / 100),
    vatCollected: round2(summaryVatCents / 100),
    netRevenue: round2((summaryGrossCents - summaryVatCents) / 100),
    averageTicket: round2(totalDocuments > 0 ? invoiceGrossCents / totalDocuments / 100 : 0),
  };

  // Build byChannel — 'apps' only included if it has documents (historical pre-AirMenu data)
  const byChannel: VendusChannelStats[] = (["salao", "eatz", "apps"] as const)
    .filter((ch) => ch !== "apps" || (channelMap.get("apps")!.invoiceCount + channelMap.get("apps")!.creditNoteCount) > 0)
    .map((ch) => {
      const acc = channelMap.get(ch)!;
      const vatCentsForChannel = acc.vatCents;
      return {
        channel: ch,
        documentCount: acc.invoiceCount,
        creditNoteCount: acc.creditNoteCount,
        grossRevenue: round2(acc.totalGross),
        vatCollected: round2(vatCentsForChannel / 100),
        netRevenue: round2(acc.totalGross - vatCentsForChannel / 100),
        averageTicket: round2(acc.invoiceCount > 0 ? acc.invoiceGross / acc.invoiceCount : 0),
        takeAwayCount: ch === "salao" ? acc.takeAwayCount : 0,
      };
    });

  // Build byCategory
  const byCategory: VendusCategoryStats[] = Array.from(categoryMap.entries())
    .map(([category, acc]) => ({
      category,
      quantitySold: acc.quantitySold,
      grossRevenue: round2(acc.grossCents / 100),
      vatCollected: round2(acc.vatCents / 100),
      netRevenue: round2((acc.grossCents - acc.vatCents) / 100),
    }))
    .sort((a, b) => b.grossRevenue - a.grossRevenue);

  // Build byVatRate
  const byVatRate: VendusVatRateStats[] = Array.from(vatRateMap.entries())
    .map(([rate, acc]) => ({
      rate,
      grossRevenue: round2(acc.grossCents / 100),
      vatAmount: round2(acc.vatCents / 100),
      netRevenue: round2((acc.grossCents - acc.vatCents) / 100),
    }))
    .sort((a, b) => b.rate - a.rate);

  // Build topProducts
  const topProducts: VendusTopProduct[] = Array.from(topProductMap.values())
    .map((p) => ({ ...p, grossRevenue: round2(p.grossCents / 100) }))
    .sort((a, b) => b.grossRevenue - a.grossRevenue);

  // Build productsByChannel
  const productsByChannel: VendusProductChannelBreakdown[] = Array.from(topProductMap.values())
    .map((p) => ({
      reference: p.reference,
      title: p.title,
      category: p.category,
      vatRate: p.vatRate,
      quantitySold: p.quantitySold,
      byChannel: p.byChannel,
      grossRevenue: round2(p.grossCents / 100),
    }))
    .sort((a, b) => b.grossRevenue - a.grossRevenue);

  return {
    summary,
    byChannel,
    byCategory,
    byVatRate,
    byDocumentType: {
      invoices: { count: totalDocuments, grossRevenue: round2(invoiceGrossCents / 100) },
      creditNotes: { count: totalCreditNotes, grossRevenue: round2(creditNoteGrossCents / 100) },
    },
    topProducts,
    productsByChannel,
    temporalDistribution: Array.from(temporalMap.values()).map((t) => ({
      ...t,
      grossRevenue: round2(t.grossRevenue),
    })),
  };
}
