import type { AirMenuMenuItem } from "../../domain/entities/air-menu-menu-item.js";
import type { AirMenuOrder } from "../../domain/entities/air-menu-order.js";
import type {
  AirMenuAnalytics,
  AirMenuAnalyticsSummary,
  CategoryStats,
  SubcategoryStats,
  PlatformStats,
  TemporalPoint,
  TopItem,
  VatRateStats,
} from "../../domain/entities/air-menu-analytics.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extrai o IVA contido num valor bruto (IVA incluído). */
function extractVat(gross: number, vatRate: number): number {
  if (vatRate === 0) return 0;
  return gross - gross / (1 + vatRate);
}

function toVatPercent(vatRate: number): number {
  return Math.round(vatRate * 100);
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

// ---------------------------------------------------------------------------
// Core computation (pure)
// ---------------------------------------------------------------------------

/**
 * Índice invertido título → item do catálogo.
 * Usado como fallback quando um item não tem PLU (ex: complementItems de pizza).
 * A chave é o título em lowercase para comparação case-insensitive.
 */
function buildTitleIndex(catalog: Map<string, AirMenuMenuItem>): Map<string, AirMenuMenuItem> {
  const index = new Map<string, AirMenuMenuItem>();
  for (const item of catalog.values()) {
    index.set(item.title.toLowerCase(), item);
  }
  return index;
}

export function computeAnalytics(
  orders: AirMenuOrder[],
  catalog: Map<string, AirMenuMenuItem>,
  startDate: Date,
  endDate: Date,
): AirMenuAnalytics {
  const titleIndex = buildTitleIndex(catalog);

  // Accumulators
  const platformMap = new Map<string, PlatformStats>();
  // parentCategory → { stats, subcategoryMap }
  const categoryMap = new Map<string, { stats: Omit<CategoryStats, "subcategories">; subMap: Map<string, SubcategoryStats> }>();
  const vatRateMap = new Map<number, VatRateStats>();
  const topItemMap = new Map<string, TopItem>();
  const temporalMap = new Map<string, TemporalPoint>();

  let totalOrders = 0;
  let totalCancellations = 0;
  let invoiceGross = 0;
  let invoiceVat = 0;
  let creditNoteGross = 0;

  const singleDay = isSingleDay(startDate, endDate);

  // Pre-populate temporal buckets so the chart always has a full axis
  if (singleDay) {
    for (let h = 0; h < 24; h++) {
      const label = `${String(h).padStart(2, "0")}:00`;
      temporalMap.set(label, { period: label, orderCount: 0, grossRevenue: 0 });
    }
  } else {
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      const label = dayLabel(cursor);
      temporalMap.set(label, { period: label, orderCount: 0, grossRevenue: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const order of orders) {
    const isInvoice = order.documentType === "invoice";
    const sign = isInvoice ? 1 : -1;

    // Document type counters
    if (isInvoice) {
      totalOrders++;
      invoiceGross += order.total;
    } else {
      totalCancellations++;
      creditNoteGross += Math.abs(order.total);
    }

    // Platform
    if (!platformMap.has(order.platform)) {
      platformMap.set(order.platform, {
        platform: order.platform,
        orderCount: 0,
        cancellationCount: 0,
        grossRevenue: 0,
        vatCollected: 0,
        netRevenue: 0,
        averageTicket: 0,
      });
    }
    const platform = platformMap.get(order.platform)!;
    if (isInvoice) platform.orderCount++;
    else platform.cancellationCount++;
    platform.grossRevenue += order.total;

    // Temporal
    const periodKey = singleDay ? hourLabel(order.documentDate) : dayLabel(order.documentDate);
    const temporal = temporalMap.get(periodKey);
    if (temporal) {
      temporal.orderCount += isInvoice ? 1 : 0;
      temporal.grossRevenue += order.total;
    }

    // Items (category, vatRate, topItems)
    for (const item of order.items) {
      // Complementos de pizza não têm PLU na API AirMenu — fallback por título
      // (strip do prefixo "+ " adicionado por collectPaidNonSizeComplements).
      const rawTitle = item.title.startsWith("+ ") ? item.title.slice(2) : item.title;
      const menuItem = item.plu
        ? catalog.get(item.plu)
        : titleIndex.get(rawTitle.toLowerCase());
      const subcategory = menuItem?.category ?? "Outros";
      const parentCategory = menuItem?.parentCategory ?? "Outros";
      const vatRate = menuItem?.vatRate ?? 0;
      const vatPercent = toVatPercent(vatRate);

      const itemGross = item.price * item.count * sign;
      const itemVat = extractVat(itemGross, vatRate);
      const itemNet = itemGross - itemVat;
      const itemQty = item.count * sign;

      // Category (agrupada por parentCategory com subcategorias)
      if (!categoryMap.has(parentCategory)) {
        categoryMap.set(parentCategory, {
          stats: { category: parentCategory, itemsSold: 0, grossRevenue: 0, vatCollected: 0, netRevenue: 0 },
          subMap: new Map(),
        });
      }
      const catEntry = categoryMap.get(parentCategory)!;
      catEntry.stats.itemsSold += itemQty;
      catEntry.stats.grossRevenue += itemGross;
      catEntry.stats.vatCollected += itemVat;
      catEntry.stats.netRevenue += itemNet;

      // Sub-categoria (apenas quando é diferente da categoria pai)
      if (subcategory !== parentCategory) {
        if (!catEntry.subMap.has(subcategory)) {
          catEntry.subMap.set(subcategory, { category: subcategory, itemsSold: 0, grossRevenue: 0, vatCollected: 0, netRevenue: 0 });
        }
        const sub = catEntry.subMap.get(subcategory)!;
        sub.itemsSold += itemQty;
        sub.grossRevenue += itemGross;
        sub.vatCollected += itemVat;
        sub.netRevenue += itemNet;
      }

      // VAT rate
      if (!vatRateMap.has(vatPercent)) {
        vatRateMap.set(vatPercent, { rate: vatPercent, grossRevenue: 0, vatAmount: 0, netRevenue: 0 });
      }
      const vat = vatRateMap.get(vatPercent)!;
      vat.grossRevenue += itemGross;
      vat.vatAmount += itemVat;
      vat.netRevenue += itemNet;

      // Top items — chave inclui título para separar tamanhos do mesmo PLU
      // (ex: "Brigadeiro Normal" vs "Brigadeiro Grande" têm o mesmo PLU).
      // Usa PLU e título canónico (sem prefixo "+ ") para que o mesmo produto
      // seja agrupado independentemente de vir como item standalone ou complemento.
      const resolvedPlu = item.plu || menuItem?.plu || '';
      const topItemKey = resolvedPlu ? `${resolvedPlu}|${rawTitle}` : `title:${rawTitle}`;
      if (!topItemMap.has(topItemKey)) {
        topItemMap.set(topItemKey, {
          plu: resolvedPlu,
          title: rawTitle,
          category: parentCategory,
          vatRate: vatPercent,
          quantitySold: 0,
          grossRevenue: 0,
        });
      }
      const top = topItemMap.get(topItemKey)!;
      top.quantitySold += itemQty;
      top.grossRevenue += itemGross;
    }

    // Platform VAT (computed from items totals accumulated above, but we need
    // to post-compute — defer to after the loop)
  }

  // Post-compute platform VAT & averageTicket
  for (const [, p] of platformMap) {
    // Extract VAT from platform gross using per-item breakdown isn't available
    // here — approximate from overall vatCollected ratio
    const totalGross = invoiceGross - creditNoteGross;
    const totalVat = Array.from(vatRateMap.values()).reduce((s, v) => s + v.vatAmount, 0);
    const vatRatio = totalGross !== 0 ? totalVat / totalGross : 0;
    p.vatCollected = round2(p.grossRevenue * vatRatio);
    p.netRevenue = round2(p.grossRevenue - p.vatCollected);

    // averageTicket: gross of invoices-only / invoice count
    // We need invoice gross per platform — approximate from total if only 1 platform,
    // otherwise use the ratio approach (platform gross includes credit notes)
    const platformInvoiceOrders = orders.filter(
      (o) => o.platform === p.platform && o.documentType === "invoice",
    );
    const platformInvoiceGross = platformInvoiceOrders.reduce((s, o) => s + o.total, 0);
    p.averageTicket = round2(
      platformInvoiceOrders.length > 0 ? platformInvoiceGross / platformInvoiceOrders.length : 0,
    );
  }

  const totalVat = Array.from(vatRateMap.values()).reduce((s, v) => s + v.vatAmount, 0);
  const summaryGross = round2(invoiceGross - creditNoteGross);
  const summaryVat = round2(totalVat);
  const summaryNet = round2(summaryGross - summaryVat);

  const summary: AirMenuAnalyticsSummary = {
    totalOrders,
    totalCancellations,
    cancellationRate: round2(
      totalOrders + totalCancellations > 0
        ? (totalCancellations / (totalOrders + totalCancellations)) * 100
        : 0,
    ),
    grossRevenue: summaryGross,
    vatCollected: summaryVat,
    netRevenue: summaryNet,
    averageTicket: round2(totalOrders > 0 ? invoiceGross / totalOrders : 0),
  };

  const topItems = Array.from(topItemMap.values())
    .sort((a, b) => b.grossRevenue - a.grossRevenue)
    .map((t) => ({ ...t, grossRevenue: round2(t.grossRevenue) }));

  return {
    summary,
    byPlatform: Array.from(platformMap.values())
      .sort((a, b) => b.grossRevenue - a.grossRevenue)
      .map((p) => ({ ...p, grossRevenue: round2(p.grossRevenue) })),
    byCategory: Array.from(categoryMap.values())
      .sort((a, b) => b.stats.grossRevenue - a.stats.grossRevenue)
      .map(({ stats, subMap }) => ({
        ...stats,
        grossRevenue: round2(stats.grossRevenue),
        vatCollected: round2(stats.vatCollected),
        netRevenue: round2(stats.netRevenue),
        subcategories: Array.from(subMap.values()).map((s) => ({
          ...s,
          grossRevenue: round2(s.grossRevenue),
          vatCollected: round2(s.vatCollected),
          netRevenue: round2(s.netRevenue),
        })),
      })),
    byVatRate: Array.from(vatRateMap.values())
      .sort((a, b) => b.rate - a.rate)
      .map((v) => ({
        ...v,
        grossRevenue: round2(v.grossRevenue),
        vatAmount: round2(v.vatAmount),
        netRevenue: round2(v.netRevenue),
      })),
    byDocumentType: {
      invoices: { count: totalOrders, grossRevenue: round2(invoiceGross) },
      creditNotes: { count: totalCancellations, grossRevenue: round2(creditNoteGross) },
    },
    topItems,
    temporalDistribution: Array.from(temporalMap.values()).map((t) => ({
      ...t,
      grossRevenue: round2(t.grossRevenue),
    })),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
