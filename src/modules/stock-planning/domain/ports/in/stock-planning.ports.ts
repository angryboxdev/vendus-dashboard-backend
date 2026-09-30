import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ForecastRunStatus } from "../../entities/forecast-run.js";
import type { PlanningAlertSeverity, PlanningAlertState, PlanningAlertType } from "../../entities/planning-alert.js";
import type { RiskLevel } from "../../services/risk-classification.service.js";
import type { ConfidenceLevel } from "../../services/confidence.service.js";
import type { AffectedProductSummary } from "../../services/impact-simulation.service.js";
import type { ProjectionPoint } from "../../services/stock-projection.service.js";

// ── DTOs partilhados ──────────────────────────────────────────────────────

export interface PlanningItemRowDTO {
  stockItemId: string;
  name: string;
  categoryId: string;
  baseUnit: string;
  currentQuantity: number;
  coverageDays: number | null;
  ruptureDate: string | null;
  riskLevel: RiskLevel;
  confidence: ConfidenceLevel;
  suggestedPurchaseQty: number | null;
  purchaseUnit: string | null;
  supplierId: string | null;
}

export interface DemandPointDTO {
  date: string;
  predictedQuantity: number;
  actualQuantity: number | null;
}

export interface QualityFlagsDTO {
  hasIncompleteMapping: boolean;
  hasNegativeOrStaleStock: boolean;
  pendingReviewsAffectingItem: boolean;
  lastPhysicalCountAt: string | null;
}

export interface RecommendationExplanationDTO {
  recommendationId: string | null;
  stockNow: number;
  targetStock: number;
  safetyStock: number;
  projectedAtWindow: number | null;
  suggestedBaseQty: number;
  suggestedPurchaseQty: number | null;
  purchaseUnit: string | null;
  estimatedCost: number | null;
  nextDeliveryDate: string | null;
  followingDeliveryDate: string | null;
  explanationData: Record<string, unknown>;
}

export interface PlanningItemDetailDTO extends PlanningItemRowDTO {
  projection: ProjectionPoint[];
  demandPoints: DemandPointDTO[];
  affectedProducts: AffectedProductSummary[];
  quality: QualityFlagsDTO;
  recommendation: RecommendationExplanationDTO | null;
}

export interface PlanningAlertRowDTO {
  id: string;
  itemId: string;
  itemName: string;
  alertType: PlanningAlertType;
  severity: PlanningAlertSeverity;
  state: PlanningAlertState;
  firstDetectedAt: string;
  lastUpdatedAt: string;
  resolvedAt: string | null;
}

export interface PlanningAlertDetailDTO extends PlanningAlertRowDTO {
  contextSnapshot: Record<string, unknown>;
  projection: ProjectionPoint[];
  affectedProducts: AffectedProductSummary[];
  quality: QualityFlagsDTO;
  explanation: string;
}

export interface SuggestedPurchaseListLineDTO {
  recommendationId: string;
  stockItemId: string;
  itemName: string;
  suggestedBaseQty: number;
  suggestedPurchaseQty: number | null;
  purchaseUnit: string | null;
  estimatedCost: number | null;
}

export interface SuggestedPurchaseListGroupDTO {
  supplierId: string | null;
  supplierName: string;
  lines: SuggestedPurchaseListLineDTO[];
  totalEstimatedCost: number | null;
}

export interface SuggestedPurchaseListDTO {
  runId: string;
  generatedAt: string;
  groups: SuggestedPurchaseListGroupDTO[];
}

export interface ForecastRunSummaryDTO {
  id: string;
  generatedAt: string;
  dataCutoffAt: string;
  horizonStart: string;
  horizonEnd: string;
  status: ForecastRunStatus;
  qualityScore: number | null;
  isLatest: boolean;
}

export interface ForecastDeviationRowDTO {
  feedbackId: string;
  periodDate: string;
  forecastValue: number;
  actualValue: number;
  deviationPercent: number | null;
  hasFeedback: boolean;
  reasonCode: string | null;
}

export interface ForecastHistoryDTO {
  runs: ForecastRunSummaryDTO[];
  recentDeviations: ForecastDeviationRowDTO[];
}

// ── Run daily forecast ──────────────────────────────────────────────────────

export interface RunDailyForecastCommand {
  organizationId: OrganizationId;
  /** `undefined` = todas as lojas ativas da organização. */
  locationId?: string;
  /** YYYY-MM-DD; default = ontem (Lisboa). */
  dataCutoffDate?: string;
  horizonDays?: number;
}

export interface RunDailyForecastLocationResultDTO {
  locationId: string;
  runId: string;
  status: ForecastRunStatus;
  demandSourcesForecast: number;
  stockItemsProjected: number;
  recommendationsGenerated: number;
  alertsActive: number;
}

export interface RunDailyForecastResultDTO {
  results: RunDailyForecastLocationResultDTO[];
}

export interface RunDailyForecastPort {
  execute(command: RunDailyForecastCommand): Promise<RunDailyForecastResultDTO>;
}

// ── Backfill de histórico de vendas ─────────────────────────────────────────

export interface BackfillDemandActualsCommand {
  organizationId: OrganizationId;
  locationId?: string;
  /** YYYY-MM-DD, inclusive. */
  since: string;
  /** YYYY-MM-DD, inclusive. */
  until: string;
}

export interface BackfillDemandActualsResultDTO {
  locationId: string;
  daysProcessed: number;
  daysFailed: string[];
}

export interface BackfillDemandActualsPort {
  execute(command: BackfillDemandActualsCommand): Promise<BackfillDemandActualsResultDTO[]>;
}

// ── Listagem/detalhe de itens ────────────────────────────────────────────────

export interface ListPlanningItemsCommand {
  organizationId: OrganizationId;
  locationId: string;
  categoryId?: string;
  supplierId?: string;
  riskLevel?: RiskLevel;
  search?: string;
}

export interface ListPlanningItemsPort {
  execute(command: ListPlanningItemsCommand): Promise<PlanningItemRowDTO[]>;
}

export interface GetItemPlanningDetailCommand {
  organizationId: OrganizationId;
  locationId: string;
  stockItemId: string;
}

export interface GetItemPlanningDetailPort {
  execute(command: GetItemPlanningDetailCommand): Promise<PlanningItemDetailDTO>;
}

// ── Alertas ──────────────────────────────────────────────────────────────────

export interface ListPlanningAlertsCommand {
  organizationId: OrganizationId;
  locationId: string;
  state?: PlanningAlertState;
  alertType?: PlanningAlertType;
}

export interface ListPlanningAlertsPort {
  execute(command: ListPlanningAlertsCommand): Promise<PlanningAlertRowDTO[]>;
}

export interface GetPlanningAlertDetailCommand {
  organizationId: OrganizationId;
  alertId: string;
}

export interface GetPlanningAlertDetailPort {
  execute(command: GetPlanningAlertDetailCommand): Promise<PlanningAlertDetailDTO>;
}

export interface AcknowledgeAlertCommand {
  organizationId: OrganizationId;
  alertId: string;
  actor: string;
}

export interface AcknowledgeAlertPort {
  execute(command: AcknowledgeAlertCommand): Promise<PlanningAlertRowDTO>;
}

export interface SilenceAlertCommand {
  organizationId: OrganizationId;
  alertId: string;
  reason: string;
  /** ISO datetime; `null`/omitido = indefinidamente até a condição mudar. */
  until?: string | null;
  actor: string;
}

export interface SilenceAlertPort {
  execute(command: SilenceAlertCommand): Promise<PlanningAlertRowDTO>;
}

// ── Lista de compras sugerida ────────────────────────────────────────────────

export interface GeneratePurchaseListCommand {
  organizationId: OrganizationId;
  locationId: string;
}

export interface GeneratePurchaseListPort {
  execute(command: GeneratePurchaseListCommand): Promise<SuggestedPurchaseListDTO>;
}

export interface ReviewRecommendationCommand {
  organizationId: OrganizationId;
  recommendationId: string;
  reviewedQty: number;
  reason?: string | null;
  actor: string;
}

export interface ReviewRecommendationPort {
  execute(command: ReviewRecommendationCommand): Promise<void>;
}

// ── Desvio + feedback ────────────────────────────────────────────────────────

export interface DetectForecastDeviationCommand {
  organizationId: OrganizationId;
  locationId?: string;
  /** YYYY-MM-DD — dia já fechado a validar contra o previsto. */
  periodDate?: string;
  percentThreshold?: number;
  absoluteThreshold?: number;
}

export interface DetectForecastDeviationResultDTO {
  locationId: string;
  feedbackCreated: boolean;
  deviationPercent: number | null;
}

export interface DetectForecastDeviationPort {
  execute(command: DetectForecastDeviationCommand): Promise<DetectForecastDeviationResultDTO[]>;
}

export interface SubmitForecastFeedbackCommand {
  organizationId: OrganizationId;
  feedbackId: string;
  reasonCode: string;
  comment?: string | null;
  actor: string;
}

export interface SubmitForecastFeedbackPort {
  execute(command: SubmitForecastFeedbackCommand): Promise<void>;
}

// ── Histórico de previsões ───────────────────────────────────────────────────

export interface GetForecastHistoryCommand {
  organizationId: OrganizationId;
  locationId: string;
  limit?: number;
}

export interface GetForecastHistoryPort {
  execute(command: GetForecastHistoryCommand): Promise<ForecastHistoryDTO>;
}
