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
 */
export interface AnalyticsCachePort {
  /** Carrega meses cacheados para os anos indicados. */
  getMonths(years: number[]): Promise<CachedMonthRow[]>;

  /** Persiste meses calculados (upsert — seguro re-executar). */
  saveMonths(rows: CachedMonthRow[]): Promise<void>;
}
