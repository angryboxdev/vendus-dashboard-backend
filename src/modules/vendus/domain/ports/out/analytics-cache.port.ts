import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface CachedMonthRow {
  year: number;
  month: number;
  /** Receita bruta em cêntimos (evita arredondamentos float). */
  gross_cents: number;
  documents_count: number;
}

/**
 * Cache persistente de métricas mensais.
 *
 * Implementado por SupabaseAnalyticsCacheAdapter (adapters/out).
 * Permite ao GetAnalyticsHistoricalUseCase evitar re-fetches de meses
 * imutáveis (meses já terminados).
 *
 * `organizationId` é sempre o primeiro parâmetro (D2) — este é o único port
 * de saída do módulo que constrói queries Supabase; os restantes falam
 * apenas com a API HTTP do Vendus ou vivem em memória e não ganham este
 * parâmetro (ver secção "Isolamento por organização" no README).
 */
export interface AnalyticsCachePort {
  /** Carrega meses cacheados para os anos indicados. */
  getMonths(organizationId: OrganizationId, years: number[]): Promise<CachedMonthRow[]>;

  /** Persiste meses calculados (upsert — seguro re-executar). */
  saveMonths(organizationId: OrganizationId, rows: CachedMonthRow[]): Promise<void>;
}
