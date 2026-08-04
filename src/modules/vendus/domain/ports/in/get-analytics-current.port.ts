import type { AnalyticsCurrentResponse } from "../../entities/vendus-analytics.js";

export interface GetAnalyticsCurrentParams {
  year: number;
  month: number;
}

/**
 * Métricas rápidas do mês: hoje, acumulado, projeção ponderada, por dia da semana.
 * Usa apenas list docs (sem fetches de detalhe) — otimizado para o dashboard.
 * Não inclui breakdown por canal (requer detail docs — usar GetSummaryPort).
 */
export interface GetAnalyticsCurrentPort {
  execute(params: GetAnalyticsCurrentParams): Promise<AnalyticsCurrentResponse>;
}
