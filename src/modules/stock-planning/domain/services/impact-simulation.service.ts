import { round6 } from "./numeric.js";

export type DemandSourceType = "pizza" | "stock";

export interface ConsumptionContribution {
  demandSourceType: DemandSourceType;
  /** `"<pizzaId>:<size>"` para pizza, `"<stockItemId>"` para stock — mesma identidade usada em `sales_demand_actuals_daily`. */
  demandSourceRef: string;
  stockItemId: string;
  contributedQty: number;
}

export interface AffectedProductSummary {
  demandSourceType: DemandSourceType;
  demandSourceRef: string;
  contributedQty: number;
}

/**
 * "Produtos afetados" por um item em risco (secções 64-66) — agrupa as
 * contribuições já calculadas por `RecipeConsumptionPort` por fonte de
 * procura distinta. Nunca duplica: cada contribuição já é a quantidade
 * exata que essa fonte de procura gera para este item (aditivo por
 * construção — duas pizzas que partilham um Preparo continuam a aparecer
 * como duas linhas distintas, sem inflacionar o total do item porque cada
 * uma soma só a sua própria parte, secção 66).
 */
export function simulateImpact(stockItemId: string, contributions: ConsumptionContribution[]): AffectedProductSummary[] {
  const byDemandSource = new Map<string, number>();
  for (const c of contributions) {
    if (c.stockItemId !== stockItemId) continue;
    const key = `${c.demandSourceType}:${c.demandSourceRef}`;
    byDemandSource.set(key, (byDemandSource.get(key) ?? 0) + c.contributedQty);
  }

  return [...byDemandSource.entries()]
    .map(([key, qty]) => {
      const separatorIndex = key.indexOf(":");
      const demandSourceType = key.slice(0, separatorIndex) as DemandSourceType;
      const demandSourceRef = key.slice(separatorIndex + 1);
      return { demandSourceType, demandSourceRef, contributedQty: round6(qty) };
    })
    .sort((a, b) => b.contributedQty - a.contributedQty);
}
