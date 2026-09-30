import { round6 } from "./numeric.js";

export interface DeliveryWindow {
  /** YYYY-MM-DD */
  date: string;
}

/**
 * Próximas janelas de entrega do fornecedor a partir de `weekdays` (1=Seg
 * … 7=Dom, secção 45) — nunca um compromisso, só um calendário informativo
 * (secção 5). Sem calendário configurado devolve `[]` — o use case decide
 * o fallback (nunca inventa uma janela, secção 51). `cutoffTime` empurra o
 * primeiro dia elegível para o dia seguinte quando `fromTime` já passou do
 * limite.
 */
export function computeNextDeliveryWindows(
  weekdays: number[] | null,
  cutoffTime: string | null,
  fromDate: string,
  fromTime: string | null,
  count: number,
): DeliveryWindow[] {
  if (!weekdays || weekdays.length === 0 || count <= 0) return [];
  const weekdaySet = new Set(weekdays);
  const windows: DeliveryWindow[] = [];

  let cursor = new Date(`${fromDate}T00:00:00Z`);
  let skipToday = false;
  if (cutoffTime && fromTime && fromTime >= cutoffTime) skipToday = true;

  for (let i = 0; windows.length < count && i < 3650; i++) {
    const isoWeekday = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    const isToday = i === 0;
    if (weekdaySet.has(isoWeekday) && !(isToday && skipToday)) {
      windows.push({ date: cursor.toISOString().slice(0, 10) });
    }
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return windows;
}

export interface PackagingInfo {
  /** Quantidade em unidade base por unidade de compra (`stock_review_learned_mappings.conversion_factor`). */
  conversionFactor: number;
  purchaseUnit: string;
}

export interface ReplenishmentInput {
  /** Stock projetado no momento em que a próxima entrega chegaria (D1). */
  projectedStockAtWindow: number;
  /** Stock de segurança + consumo esperado até à entrega seguinte (D2) — cobertura até à janela seguinte. */
  targetStock: number;
  /** `null` quando não há mapeamento fornecedor×item aprendido — nunca inventa embalagem (secção 51). */
  packaging: PackagingInfo | null;
}

export interface ReplenishmentResult {
  /** Sempre na unidade base do item — nunca `null` (é sempre calculável). */
  suggestedBaseQty: number;
  /** Arredondado para cima em embalagens completas; `null` quando não há embalagem conhecida (nunca inventada). */
  suggestedPurchaseQty: number | null;
  purchaseUnit: string | null;
}

/**
 * Quantidade de reposição sugerida = max(0, target − projetado em D1),
 * arredondada para embalagens completas só quando há mapeamento aprendido
 * (secção 45-51). MOQ nunca é aplicado aqui — não existe fonte nenhuma no
 * repositório para MOQ real, e a task proíbe fabricá-lo (secção 50); se um
 * dia existir, entra como mais um parâmetro nunca obrigatório.
 */
export function computeReplenishment(input: ReplenishmentInput): ReplenishmentResult {
  const gap = Math.max(0, input.targetStock - input.projectedStockAtWindow);
  const suggestedBaseQty = round6(gap);

  if (!input.packaging || gap === 0) {
    return {
      suggestedBaseQty,
      suggestedPurchaseQty: input.packaging ? 0 : null,
      purchaseUnit: input.packaging?.purchaseUnit ?? null,
    };
  }

  const packs = Math.ceil(gap / input.packaging.conversionFactor);
  return { suggestedBaseQty, suggestedPurchaseQty: packs, purchaseUnit: input.packaging.purchaseUnit };
}
