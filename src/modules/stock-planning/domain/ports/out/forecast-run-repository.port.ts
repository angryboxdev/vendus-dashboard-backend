import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ForecastRun } from "../../entities/forecast-run.js";
import type { DemandSourceType } from "../../services/impact-simulation.service.js";

export interface ForecastDemandPointRow {
  demandSourceType: DemandSourceType;
  demandSourceRef: string;
  forecastDate: string;
  predictedQuantity: number;
  confidence: "alta" | "media" | "baixa";
}

export interface ForecastStockRequirementRow {
  stockItemId: string;
  forecastDate: string;
  expectedConsumption: number;
  cumulativeConsumption: number;
}

export interface ReplenishmentRecommendationRow {
  stockItemId: string;
  supplierId: string | null;
  stockNow: number;
  projectedAtWindow: number | null;
  targetStock: number;
  safetyStock: number;
  suggestedBaseQty: number;
  suggestedPurchaseQty: number | null;
  purchaseUnit: string | null;
  estimatedCost: number | null;
  confidence: "alta" | "media" | "baixa";
  explanationData: Record<string, unknown>;
}

export interface SaveForecastRunResultCommand {
  organizationId: OrganizationId;
  run: ForecastRun;
  demandPoints: ForecastDemandPointRow[];
  stockRequirements: ForecastStockRequirementRow[];
  recommendations: ReplenishmentRecommendationRow[];
}

export interface ReplenishmentRecommendationDTO extends ReplenishmentRecommendationRow {
  id: string;
  runId: string;
}

/**
 * `forecast_runs` + as 3 tabelas por-run que dependem dele
 * (`forecast_demand_points`/`forecast_stock_requirements`/
 * `replenishment_recommendations`). Cada run novo marca-se `is_latest=true`
 * e o run anterior da mesma loja passa a `false` — histórico nunca
 * apagado (secção 27). Escrita feita em vários passos simples de adapter
 * (não uma única RPC `plpgsql`) — ver README "Design decisions" para o
 * porquê.
 */
export interface ForecastRunRepositoryPort {
  insertRun(organizationId: OrganizationId, run: ForecastRun): Promise<void>;
  /** Marca este run como concluído/falhado E grava os dados do run atomicamente do ponto de vista do consumidor (is_latest flip incluído). */
  saveRunResult(command: SaveForecastRunResultCommand): Promise<void>;
  markRunFailed(organizationId: OrganizationId, run: ForecastRun): Promise<void>;
  findLatestRun(organizationId: OrganizationId, locationId: string): Promise<ForecastRun | null>;
  findRunById(organizationId: OrganizationId, runId: string): Promise<ForecastRun | null>;
  findStockRequirements(organizationId: OrganizationId, runId: string, stockItemId: string): Promise<ForecastStockRequirementRow[]>;
  findDemandPointsForRun(organizationId: OrganizationId, runId: string): Promise<ForecastDemandPointRow[]>;
  findRecommendations(organizationId: OrganizationId, runId: string): Promise<ReplenishmentRecommendationDTO[]>;
  findRecommendationById(organizationId: OrganizationId, recommendationId: string): Promise<ReplenishmentRecommendationDTO | null>;
  /** Runs anteriores da loja, mais recentes primeiro — para "Histórico de previsões" e backtest. */
  listPastRuns(organizationId: OrganizationId, locationId: string, limit: number): Promise<ForecastRun[]>;
}
