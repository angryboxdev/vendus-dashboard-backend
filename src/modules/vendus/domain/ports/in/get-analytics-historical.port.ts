import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AnalyticsHistoricalResponse } from "../../entities/vendus-analytics.js";

export interface GetAnalyticsHistoricalParams {
  organizationId: OrganizationId;
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
 *
 * O único port de entrada do módulo com `organizationId` (D2) — é o único
 * caminho que toca o `AnalyticsCachePort`, que por sua vez é o único port
 * de saída que constrói queries Supabase.
 */
export interface GetAnalyticsHistoricalPort {
  execute(params: GetAnalyticsHistoricalParams): Promise<AnalyticsHistoricalResponse>;
}
