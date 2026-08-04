import type { AnalyticsHistoricalResponse } from "../../entities/vendus-analytics.js";

export interface GetAnalyticsHistoricalParams {
  year: number;
  month: number;
}

/**
 * Métricas históricas: total anual, total acumulado, gráfico de crescimento
 * (últimos 6 meses) e comparações (mês anterior, YTD ano anterior).
 *
 * Cache-aware: meses imutáveis (anos passados + meses completos do ano atual)
 * são lidos do Supabase (AnalyticsCachePort). Apenas o mês atual é sempre
 * fresco da API Vendus.
 */
export interface GetAnalyticsHistoricalPort {
  execute(params: GetAnalyticsHistoricalParams): Promise<AnalyticsHistoricalResponse>;
}
