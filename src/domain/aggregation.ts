import type { AggTotals, Category, ProductAgg } from "./types.js";

export function createTotals(): AggTotals {
  return {
    gross: 0,
    net: 0,
    tax_amount: 0,
    units_count: 0,
    documents_count: 0,
    items_count: 0,
  };
}

export function addToTotals(
  t: AggTotals,
  gross: number,
  net: number,
  qty: number
) {
  t.gross += gross;
  t.net += net;
  t.tax_amount += gross - net;
  t.units_count += qty;
  t.items_count += 1;
}

export function addTaxBreakdown(
  map: Map<
    number,
    { rate: number; base: number; amount: number; total: number }
  >,
  rate: number,
  base: number,
  amount: number,
  total: number
) {
  const prev = map.get(rate) || { rate, base: 0, amount: 0, total: 0 };
  prev.base += base;
  prev.amount += amount;
  prev.total += total;
  map.set(rate, prev);
}

export function createProductAgg(
  reference: string,
  title: string,
  category: Category,
  tax_rate: number
): ProductAgg {
  return {
    reference,
    title,
    category,
    tax_rate,
    qty: 0,
    amounts: {
      gross_total: 0,
      net_total: 0,
      tax_total: 0,
      avg_gross_unit: 0,
      avg_net_unit: 0,
    },
    channels: {
      restaurant: { qty: 0, gross_total: 0, net_total: 0 },
      delivery: { qty: 0, gross_total: 0, net_total: 0 },
      unknown: { qty: 0, gross_total: 0, net_total: 0 },
    },
    payment_methods: [],
  };
}
