import { round6 } from "./numeric.js";

export interface BacktestPoint {
  predicted: number;
  actual: number;
}

export interface BacktestResult {
  mae: number;
  /** `null` quando não há venda real nenhuma no período — nunca `Infinity`/`NaN` (mesma convenção do `stock-count`). */
  wape: number | null;
  /** Sinal (positivo = a sobre-prever); `null` pela mesma razão de `wape`. */
  bias: number | null;
  sampleSize: number;
}

/**
 * MAE/WAPE/bias comparando previsões passadas com o real observado
 * (`sales_demand_actuals_daily`) — usado por `confidence.service.ts` para
 * medir o desempenho recente do modelo (secção 22-23).
 */
export function computeBacktest(points: BacktestPoint[]): BacktestResult {
  if (points.length === 0) return { mae: 0, wape: null, bias: null, sampleSize: 0 };

  const errors = points.map((p) => p.predicted - p.actual);
  const absErrors = errors.map((e) => Math.abs(e));
  const sumAbsError = absErrors.reduce((a, b) => a + b, 0);
  const sumActual = points.reduce((a, p) => a + Math.abs(p.actual), 0);

  const mae = sumAbsError / points.length;
  const wape = sumActual > 0 ? sumAbsError / sumActual : null;
  const bias = sumActual > 0 ? errors.reduce((a, b) => a + b, 0) / sumActual : null;

  return {
    mae: round6(mae),
    wape: wape != null ? round6(wape) : null,
    bias: bias != null ? round6(bias) : null,
    sampleSize: points.length,
  };
}
