import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { ForecastRun, type ForecastRunStatus } from "../../domain/entities/forecast-run.js";
import type {
  ForecastDemandPointRow,
  ForecastRunRepositoryPort,
  ForecastStockRequirementRow,
  ReplenishmentRecommendationDTO,
  SaveForecastRunResultCommand,
} from "../../domain/ports/out/forecast-run-repository.port.js";

interface RunRow {
  id: string;
  location_id: string;
  generated_at: string;
  data_cutoff_at: string;
  horizon_start: string;
  horizon_end: string;
  model_name: string;
  model_version: string;
  status: ForecastRunStatus;
  quality_score: number | null;
  is_latest: boolean;
  created_at: string;
}

function toRun(organizationId: OrganizationId, row: RunRow): ForecastRun {
  return ForecastRun.reconstitute({
    id: row.id,
    organizationId,
    locationId: row.location_id,
    generatedAt: new Date(row.generated_at),
    dataCutoffAt: new Date(row.data_cutoff_at),
    horizonStart: row.horizon_start,
    horizonEnd: row.horizon_end,
    modelName: row.model_name,
    modelVersion: row.model_version,
    status: row.status,
    qualityScore: row.quality_score != null ? Number(row.quality_score) : null,
    isLatest: row.is_latest,
    createdAt: new Date(row.created_at),
  });
}

function runToRow(run: ForecastRun): Record<string, unknown> {
  const p = run.toProps();
  return {
    id: p.id,
    location_id: p.locationId,
    generated_at: p.generatedAt.toISOString(),
    data_cutoff_at: p.dataCutoffAt.toISOString(),
    horizon_start: p.horizonStart,
    horizon_end: p.horizonEnd,
    model_name: p.modelName,
    model_version: p.modelVersion,
    status: p.status,
    quality_score: p.qualityScore,
    is_latest: p.isLatest,
    created_at: p.createdAt.toISOString(),
  };
}

/**
 * `forecast_runs` + as 3 tabelas por-run. Escrita em vários passos simples
 * (não uma única RPC `plpgsql`) — este é um job em lote de escritor único
 * (o cron diário), nunca concorrência de utilizadores editando a mesma
 * linha, por isso o lock otimista de `stock-count`/`stock-purchase-review`
 * (que existe para resolver 2 gestores a mutar a mesma sessão ao mesmo
 * tempo) não se aplica aqui — ver README "Design decisions".
 */
export class SupabaseForecastRunRepository implements ForecastRunRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async insertRun(organizationId: OrganizationId, run: ForecastRun): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("forecast_runs").insert(runToRow(run));
    if (error) throw new Error(error.message);
  }

  async saveRunResult(command: SaveForecastRunResultCommand): Promise<void> {
    const { organizationId, run, demandPoints, stockRequirements, recommendations } = command;
    const scoped = this.scopedQuery(organizationId);

    // Flip is_latest do run anterior desta loja para false ANTES de marcar o novo como latest
    // — histórico nunca apagado, só a flag muda (secção 27).
    const { error: flipError } = await scoped
      .table("forecast_runs")
      .update({ is_latest: false })
      .eq("location_id", run.toProps().locationId)
      .neq("id", run.id);
    if (flipError) throw new Error(flipError.message);

    const { error: runError } = await scoped.table("forecast_runs").update(runToRow(run)).eq("id", run.id);
    if (runError) throw new Error(runError.message);

    if (demandPoints.length > 0) {
      const rows = demandPoints.map((d) => ({
        id: randomUUID(),
        run_id: run.id,
        demand_source_type: d.demandSourceType,
        demand_source_ref: d.demandSourceRef,
        forecast_date: d.forecastDate,
        predicted_quantity: d.predictedQuantity,
        confidence: d.confidence,
      }));
      const { error } = await scoped.table("forecast_demand_points").upsert(rows, {
        onConflict: "run_id,demand_source_type,demand_source_ref,forecast_date",
      });
      if (error) throw new Error(error.message);
    }

    if (stockRequirements.length > 0) {
      const rows = stockRequirements.map((r) => ({
        id: randomUUID(),
        run_id: run.id,
        stock_item_id: r.stockItemId,
        forecast_date: r.forecastDate,
        expected_consumption: r.expectedConsumption,
        cumulative_consumption: r.cumulativeConsumption,
      }));
      const { error } = await scoped.table("forecast_stock_requirements").upsert(rows, {
        onConflict: "run_id,stock_item_id,forecast_date",
      });
      if (error) throw new Error(error.message);
    }

    if (recommendations.length > 0) {
      const rows = recommendations.map((r) => ({
        id: randomUUID(),
        run_id: run.id,
        stock_item_id: r.stockItemId,
        supplier_id: r.supplierId,
        stock_now: r.stockNow,
        projected_at_window: r.projectedAtWindow,
        target_stock: r.targetStock,
        safety_stock: r.safetyStock,
        suggested_base_qty: r.suggestedBaseQty,
        suggested_purchase_qty: r.suggestedPurchaseQty,
        purchase_unit: r.purchaseUnit,
        estimated_cost: r.estimatedCost,
        confidence: r.confidence,
        explanation_data: r.explanationData,
      }));
      const { error } = await scoped.table("replenishment_recommendations").upsert(rows, { onConflict: "run_id,stock_item_id" });
      if (error) throw new Error(error.message);
    }
  }

  async markRunFailed(organizationId: OrganizationId, run: ForecastRun): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("forecast_runs").update(runToRow(run)).eq("id", run.id);
    if (error) throw new Error(error.message);
  }

  async findLatestRun(organizationId: OrganizationId, locationId: string): Promise<ForecastRun | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("forecast_runs")
      .select("*")
      .eq("location_id", locationId)
      .eq("is_latest", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toRun(organizationId, data as unknown as RunRow) : null;
  }

  async findRunById(organizationId: OrganizationId, runId: string): Promise<ForecastRun | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("forecast_runs").select("*").eq("id", runId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toRun(organizationId, data as unknown as RunRow) : null;
  }

  async findStockRequirements(organizationId: OrganizationId, runId: string, stockItemId: string): Promise<ForecastStockRequirementRow[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("forecast_stock_requirements")
      .select("stock_item_id, forecast_date, expected_consumption, cumulative_consumption")
      .eq("run_id", runId)
      .eq("stock_item_id", stockItemId)
      .order("forecast_date", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as { stock_item_id: string; forecast_date: string; expected_consumption: number; cumulative_consumption: number }[]).map(
      (r) => ({
        stockItemId: r.stock_item_id,
        forecastDate: r.forecast_date,
        expectedConsumption: Number(r.expected_consumption),
        cumulativeConsumption: Number(r.cumulative_consumption),
      }),
    );
  }

  async findDemandPointsForRun(organizationId: OrganizationId, runId: string): Promise<ForecastDemandPointRow[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("forecast_demand_points")
      .select("demand_source_type, demand_source_ref, forecast_date, predicted_quantity, confidence")
      .eq("run_id", runId);
    if (error) throw new Error(error.message);
    return (
      (data ?? []) as unknown as {
        demand_source_type: "pizza" | "stock";
        demand_source_ref: string;
        forecast_date: string;
        predicted_quantity: number;
        confidence: "alta" | "media" | "baixa";
      }[]
    ).map((r) => ({
      demandSourceType: r.demand_source_type,
      demandSourceRef: r.demand_source_ref,
      forecastDate: r.forecast_date,
      predictedQuantity: Number(r.predicted_quantity),
      confidence: r.confidence,
    }));
  }

  async findRecommendations(organizationId: OrganizationId, runId: string): Promise<ReplenishmentRecommendationDTO[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("replenishment_recommendations").select("*").eq("run_id", runId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toRecommendationDTO);
  }

  async findRecommendationById(organizationId: OrganizationId, recommendationId: string): Promise<ReplenishmentRecommendationDTO | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("replenishment_recommendations")
      .select("*")
      .eq("id", recommendationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toRecommendationDTO(data as unknown as Record<string, unknown>) : null;
  }

  async listPastRuns(organizationId: OrganizationId, locationId: string, limit: number): Promise<ForecastRun[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("forecast_runs")
      .select("*")
      .eq("location_id", locationId)
      .order("generated_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as RunRow[]).map((r) => toRun(organizationId, r));
  }
}

function toRecommendationDTO(row: Record<string, unknown>): ReplenishmentRecommendationDTO {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    stockItemId: row.stock_item_id as string,
    supplierId: (row.supplier_id as string | null) ?? null,
    stockNow: Number(row.stock_now),
    projectedAtWindow: row.projected_at_window != null ? Number(row.projected_at_window) : null,
    targetStock: Number(row.target_stock),
    safetyStock: Number(row.safety_stock),
    suggestedBaseQty: Number(row.suggested_base_qty),
    suggestedPurchaseQty: row.suggested_purchase_qty != null ? Number(row.suggested_purchase_qty) : null,
    purchaseUnit: (row.purchase_unit as string | null) ?? null,
    estimatedCost: row.estimated_cost != null ? Number(row.estimated_cost) : null,
    confidence: row.confidence as "alta" | "media" | "baixa",
    explanationData: (row.explanation_data as Record<string, unknown>) ?? {},
  };
}
