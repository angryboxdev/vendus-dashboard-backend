import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PlanningItemRowDTO, QualityFlagsDTO } from "../../domain/ports/in/stock-planning.ports.js";
import type { ForecastRunRepositoryPort } from "../../domain/ports/out/forecast-run-repository.port.js";
import type { PendingPurchaseReviewReadPort } from "../../domain/ports/out/pending-purchase-review-read.port.js";
import type { PlanningAlertRepositoryPort } from "../../domain/ports/out/planning-alert-repository.port.js";
import type { StockCountSignalReadPort } from "../../domain/ports/out/stock-count-signal-read.port.js";
import type { StockItemPlanningSnapshot } from "../../domain/ports/out/stock-item-planning-read.port.js";
import type { StockQuantitySnapshot } from "../../domain/ports/out/stock-quantity-read.port.js";
import { computeConfidence, type ConfidenceLevel } from "../../domain/services/confidence.service.js";
import { classifyRisk } from "../../domain/services/risk-classification.service.js";
import { computeStockProjection, type ProjectionPoint } from "../../domain/services/stock-projection.service.js";

/** Nº de dias de cobertura abaixo do qual o item já merece "Atenção", mesmo sem rutura iminente — badge próprio deste módulo, não um requisito literal da task. */
export const ATTENTION_COVERAGE_DAYS_THRESHOLD = 7;

export interface ItemProjectionContext {
  item: StockItemPlanningSnapshot;
  snapshot: StockQuantitySnapshot;
  projection: ReturnType<typeof computeStockProjection>;
  recommendation: { supplierId: string | null; suggestedBaseQty: number; suggestedPurchaseQty: number | null; purchaseUnit: string | null } | null;
  isSlowMoving: boolean;
  confidence: ConfidenceLevel;
  quality: QualityFlagsDTO;
}

/** Sem run nenhum ainda (secção 91 — nunca inventa dados): projeção vazia, confiança "baixa", risco "ok" (não há sinal de rutura sem forecast). */
export function buildRowWithoutRun(item: StockItemPlanningSnapshot, snapshot: StockQuantitySnapshot | undefined): PlanningItemRowDTO {
  return {
    stockItemId: item.id,
    name: item.name,
    categoryId: item.categoryId,
    baseUnit: item.baseUnit,
    currentQuantity: snapshot?.currentQuantity ?? 0,
    coverageDays: null,
    ruptureDate: null,
    riskLevel: "ok",
    confidence: "baixa",
    suggestedPurchaseQty: null,
    purchaseUnit: null,
    supplierId: null,
  };
}

export function buildRow(ctx: ItemProjectionContext): PlanningItemRowDTO {
  const riskLevel = classifyRisk({
    ruptureDate: ctx.projection.ruptureDate,
    coverageDays: ctx.projection.coverageDays,
    isSlowMoving: ctx.isSlowMoving,
    attentionCoverageDaysThreshold: ATTENTION_COVERAGE_DAYS_THRESHOLD,
  });
  return {
    stockItemId: ctx.item.id,
    name: ctx.item.name,
    categoryId: ctx.item.categoryId,
    baseUnit: ctx.item.baseUnit,
    currentQuantity: ctx.snapshot.currentQuantity,
    coverageDays: ctx.projection.coverageDays,
    ruptureDate: ctx.projection.ruptureDate,
    riskLevel,
    confidence: ctx.confidence,
    suggestedPurchaseQty: ctx.recommendation?.suggestedPurchaseQty ?? null,
    purchaseUnit: ctx.recommendation?.purchaseUnit ?? null,
    supplierId: ctx.recommendation?.supplierId ?? null,
  };
}

/**
 * Recalcula projeção + confiança + qualidade em leitura, a partir do
 * último run (`forecast_stock_requirements` + `stock_quantity` ao vivo) —
 * nunca persiste a projeção em si (decisão arquitetural do módulo).
 */
export async function buildItemProjectionContext(deps: {
  organizationId: OrganizationId;
  runId: string;
  item: StockItemPlanningSnapshot;
  snapshot: StockQuantitySnapshot;
  forecastRunRepo: ForecastRunRepositoryPort;
  planningAlertRepo: PlanningAlertRepositoryPort;
  pendingPurchaseReviewRead: PendingPurchaseReviewReadPort;
  stockCountSignalRead: StockCountSignalReadPort;
  recommendation: { supplierId: string | null; suggestedBaseQty: number; suggestedPurchaseQty: number | null; purchaseUnit: string | null; confidence: ConfidenceLevel } | null;
  hasIncompleteMapping: boolean;
  today: string;
}): Promise<ItemProjectionContext> {
  const requirements = await deps.forecastRunRepo.findStockRequirements(deps.organizationId, deps.runId, deps.item.id);
  const projection = computeStockProjection(
    deps.snapshot.currentQuantity,
    requirements.map((r) => ({ date: r.forecastDate, expectedConsumption: r.expectedConsumption })),
  );

  const alerts = await deps.planningAlertRepo.findAll(deps.organizationId, { alertType: "excess_stock" });
  const isSlowMoving = alerts.some((a) => a.itemId === deps.item.id && a.state !== "resolved");

  const pendingReview = await deps.pendingPurchaseReviewRead.hasPendingReviewForItem(deps.organizationId, deps.item.id);
  const countSignal = await deps.stockCountSignalRead.getSignalForItem(deps.organizationId, deps.item.id);
  const daysSinceCount = countSignal.lastCompletedCountAt
    ? Math.round((new Date(deps.today).getTime() - countSignal.lastCompletedCountAt.getTime()) / 86_400_000)
    : null;

  const confidence =
    deps.recommendation?.confidence ??
    computeConfidence({
      historyDaysAvailable: requirements.length,
      backtestWape: null,
      hasIncompleteMapping: deps.hasIncompleteMapping,
      pendingReviewsAffectingItem: pendingReview,
      hasNegativeOrStaleStock: deps.snapshot.currentQuantity < 0,
      daysSinceLastPhysicalCount: daysSinceCount,
    });

  return {
    item: deps.item,
    snapshot: deps.snapshot,
    projection,
    recommendation: deps.recommendation,
    isSlowMoving,
    confidence,
    quality: {
      hasIncompleteMapping: deps.hasIncompleteMapping,
      hasNegativeOrStaleStock: deps.snapshot.currentQuantity < 0,
      pendingReviewsAffectingItem: pendingReview,
      lastPhysicalCountAt: countSignal.lastCompletedCountAt ? countSignal.lastCompletedCountAt.toISOString() : null,
    },
  };
}
