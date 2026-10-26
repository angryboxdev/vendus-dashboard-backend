import type { PurchaseObservation } from "../entities/price-history.js";
import { isoWeek, weeklyPriceHistory } from "./price-history.service.js";

/**
 * Resumo de custos de um ingrediente para a lista «Artigos e ingredientes» (task V6 §6). Três métricas
 * com nome próprio (nunca misturadas): último custo de compra confirmado, referência comparativa e
 * custo manual (este vem do catálogo, não daqui). Cêntimos por unidade base, s/ IVA, depois do desconto.
 */
export interface IngredientCostOverview {
  stockItemId: string;
  /** Última compra confirmada (a data mais recente; várias linhas nesse dia → média ponderada). */
  lastPurchase: { invoiceDate: string; supplierId: string | null; supplierName: string; centsPerUnit: number } | null;
  /** Referência: média ponderada das compras confirmadas nas `referenceWeeks` semanas antes da última compra. */
  reference: { centsPerUnit: number; from: string; to: string; purchases: number } | null;
  /** (último − referência) ÷ referência; null sem referência válida («histórico insuficiente»). */
  changeRatio: number | null;
  /** Média ponderada semanal das últimas `weeks` semanas (null = sem compra nessa semana). */
  weekly: (number | null)[];
  purchases: number;
}

export const REFERENCE_METHOD = "Média ponderada das compras confirmadas nas 12 semanas anteriores à última compra";

const DAY = 86_400_000;
const shift = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const weighted = (obs: PurchaseObservation[]) => {
  const q = obs.reduce((s, o) => s + o.quantity, 0);
  return q > 0 ? obs.reduce((s, o) => s + o.netCents, 0) / q : null;
};

export function ingredientCostOverview(stockItemId: string, observations: PurchaseObservation[], today: string, weeks = 12, referenceWeeks = 12): IngredientCostOverview {
  const valid = observations.filter((o) => o.quantity > 0);
  const lastDate = valid.reduce<string | null>((m, o) => (m === null || o.invoiceDate > m ? o.invoiceDate : m), null);
  if (!lastDate) return { stockItemId, lastPurchase: null, reference: null, changeRatio: null, weekly: Array(weeks).fill(null), purchases: 0 };

  const onLast = valid.filter((o) => o.invoiceDate === lastDate);
  const last = weighted(onLast)!;
  const from = shift(isoWeek(lastDate).weekStart, -7 * referenceWeeks);
  const before = valid.filter((o) => o.invoiceDate < lastDate && o.invoiceDate >= from);
  const ref = weighted(before);
  return {
    stockItemId,
    lastPurchase: { invoiceDate: lastDate, supplierId: onLast[0]!.supplierId ?? null, supplierName: onLast[0]!.supplierName, centsPerUnit: last },
    reference: ref !== null && ref > 0 ? { centsPerUnit: ref, from, to: shift(lastDate, -1), purchases: before.length } : null,
    changeRatio: ref !== null && ref > 0 ? last / ref - 1 : null,
    weekly: weeklyPriceHistory(valid, today, weeks).map((w) => w.avgCentsPerUnit),
    purchases: valid.length,
  };
}
