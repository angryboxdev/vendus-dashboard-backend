import type { SupplierPlanningReadModel } from "../ports/out/supplier-planning-read.port.js";
import type { SupplierPlanningSummaryDTO } from "../ports/in/supplier-planning.ports.js";

const CATEGORY_SLOTS = 4;
const DAY_MS = 86_400_000;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthsAgo(today: Date, months: number): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, today.getUTCDate()));
  return isoDate(d);
}

/** Unidade em que se mostra o preço: g → kg, ml/cl → l; o resto fica como está (un, kg, l…). */
export function priceUnitOf(baseUnit: string): { label: string; factor: number } {
  switch (baseUnit) {
    case "g":
      return { label: "kg", factor: 1000 };
    case "ml":
      return { label: "l", factor: 1000 };
    case "cl":
      return { label: "l", factor: 100 };
    default:
      return { label: baseUnit, factor: 1 };
  }
}

/**
 * «Resumo no planeamento» a partir dos dados em bruto dos últimos 12 meses: compras dos últimos 3 meses,
 * frequência de compra (sem encomendas registadas, é o dado real que existe), subcategorias por valor e,
 * por artigo, o último preço e o preço médio de cada mês (sempre por artigo — médias entre artigos
 * diferentes misturariam €/kg com €/l).
 */
export function buildSupplierPlanningSummary(m: SupplierPlanningReadModel, today: Date): SupplierPlanningSummaryDTO {
  const since3 = monthsAgo(today, 3);
  const purchasesLast3Months = m.invoices.filter((i) => i.date >= since3).reduce((s, i) => s + i.netCents, 0) / 100;

  const dates = [...new Set(m.invoices.map((i) => i.date))].sort();
  const purchaseFrequencyDays =
    dates.length >= 2 ? Math.round(((Date.parse(dates[dates.length - 1]!) - Date.parse(dates[0]!)) / DAY_MS / (dates.length - 1)) * 10) / 10 : null;

  // Subcategorias (só valores positivos contam para a percentagem; notas de crédito abatem na própria).
  const byCategory = new Map<string, { name: string; cents: number }>();
  for (const l of m.lines) {
    const key = l.categoryId ?? "none";
    const cur = byCategory.get(key) ?? { name: l.categoryName ?? "Sem categoria", cents: 0 };
    cur.cents += l.netCents;
    byCategory.set(key, cur);
  }
  const ranked = [...byCategory.values()].filter((c) => c.cents > 0).sort((a, b) => b.cents - a.cents);
  const total = ranked.reduce((s, c) => s + c.cents, 0);
  const top = ranked.length > CATEGORY_SLOTS + 1 ? [...ranked.slice(0, CATEGORY_SLOTS), { name: "Outros", cents: ranked.slice(CATEGORY_SLOTS).reduce((s, c) => s + c.cents, 0) }] : ranked;
  const categories = total > 0 ? top.map((c) => ({ name: c.name, amount: c.cents / 100, pct: Math.round((c.cents / total) * 100) })) : [];

  // Artigos de stock.
  type Acc = { stockItemId: string; name: string; baseUnit: string; last: { date: string; cents: number }; count: number; byMonth: Map<string, number[]> };
  const byItem = new Map<string, Acc>();
  for (const p of m.stockPurchases) {
    const acc = byItem.get(p.stockItemId) ?? { stockItemId: p.stockItemId, name: p.itemName, baseUnit: p.baseUnit, last: { date: p.date, cents: p.unitCostPerBaseUnitCents }, count: 0, byMonth: new Map() };
    acc.count++;
    if (p.date >= acc.last.date) acc.last = { date: p.date, cents: p.unitCostPerBaseUnitCents };
    const month = p.date.slice(0, 7);
    acc.byMonth.set(month, [...(acc.byMonth.get(month) ?? []), p.unitCostPerBaseUnitCents]);
    byItem.set(p.stockItemId, acc);
  }
  const items = [...byItem.values()]
    .sort((a, b) => b.last.date.localeCompare(a.last.date) || a.name.localeCompare(b.name))
    .map((a) => {
      const unit = priceUnitOf(a.baseUnit);
      const toPrice = (cents: number) => round2((cents / 100) * unit.factor);
      return {
        stockItemId: a.stockItemId,
        name: a.name,
        priceUnit: unit.label,
        lastPurchaseDate: a.last.date,
        lastUnitPrice: toPrice(a.last.cents),
        purchaseCount: a.count,
        monthly: [...a.byMonth.entries()]
          .sort(([x], [y]) => x.localeCompare(y))
          .map(([month, costs]) => ({ month, avgUnitPrice: toPrice(costs.reduce((s, c) => s + c, 0) / costs.length) })),
      };
    });
  const defaultItem = [...items].sort((a, b) => b.purchaseCount - a.purchaseCount || b.lastPurchaseDate.localeCompare(a.lastPurchaseDate))[0];

  return {
    associatedItems: items.length,
    purchasesLast3Months: round2(purchasesLast3Months),
    purchaseFrequencyDays,
    invoicesLast12Months: m.invoices.length,
    categories,
    items,
    defaultItemId: defaultItem?.stockItemId ?? null,
  };
}
