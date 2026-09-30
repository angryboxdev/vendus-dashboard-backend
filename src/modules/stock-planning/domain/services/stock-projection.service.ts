import { round6 } from "./numeric.js";

export interface ForecastRequirementDay {
  /** YYYY-MM-DD */
  date: string;
  expectedConsumption: number;
}

export interface ProjectionPoint {
  date: string;
  expectedConsumption: number;
  cumulativeConsumption: number;
  /** stock atual (ao vivo) − consumo acumulado — nunca inclui entrada imaginária nenhuma (secção 40). */
  projectedStock: number;
}

export interface StockProjectionResult {
  points: ProjectionPoint[];
  /**
   * `null` quando não há consumo previsto nenhum no horizonte — nunca
   * `Infinity` para "nunca vai faltar" (secção 88, no false precision).
   * `0` quando o stock teórico já está em rutura hoje (secção 89 — stock
   * negativo continua a produzir uma projeção, nunca bloqueia o cálculo).
   */
  coverageDays: number | null;
  /** Primeira data em que a projeção cruza `<= 0`; `null` se não acontece dentro do horizonte. */
  ruptureDate: string | null;
}

/**
 * Projeção de stock nunca persistida — sempre `stock atual (lido ao vivo)
 * − consumo previsto acumulado` (decisão arquitetural do módulo, ver
 * README). Guardado explicitamente contra `Infinity`/`NaN` mesmo com
 * `currentStock` negativo ou corrompido (secção 18/89), mesma convenção do
 * `stock-count`'s `variance.service.ts`.
 */
export function computeStockProjection(currentStock: number, requirements: ForecastRequirementDay[]): StockProjectionResult {
  let cumulative = 0;
  const points: ProjectionPoint[] = [];
  let ruptureDate: string | null = null;

  for (const r of requirements) {
    cumulative += r.expectedConsumption;
    const projectedStock = currentStock - cumulative;
    points.push({
      date: r.date,
      expectedConsumption: round6(r.expectedConsumption),
      cumulativeConsumption: round6(cumulative),
      projectedStock: round6(projectedStock),
    });
    if (ruptureDate === null && projectedStock <= 0) ruptureDate = r.date;
  }

  const coverageDays = computeCoverageDays(currentStock, requirements);
  return { points, coverageDays, ruptureDate };
}

function computeCoverageDays(currentStock: number, requirements: ForecastRequirementDay[]): number | null {
  const totalConsumption = requirements.reduce((sum, r) => sum + Math.max(0, r.expectedConsumption), 0);
  if (totalConsumption <= 0 || !Number.isFinite(currentStock)) return null;
  if (currentStock <= 0) return 0;

  let remaining = currentStock;
  let days = 0;
  for (const r of requirements) {
    const consumption = Math.max(0, r.expectedConsumption);
    if (consumption === 0) {
      days += 1;
      continue;
    }
    if (remaining <= 0) break;
    if (remaining >= consumption) {
      remaining -= consumption;
      days += 1;
    } else {
      days += remaining / consumption;
      remaining = 0;
      break;
    }
  }
  return round6(days);
}
