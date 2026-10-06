import { Router } from "express";
import {
  ForecastFeedbackAlreadySubmittedError,
  ForecastFeedbackNotFoundError,
  NoActiveLocationError,
  NoLatestForecastRunError,
  PlanningAlertNotFoundError,
  ReasonCodeRequiredError,
  RecommendationNotFoundError,
  ReviewedQuantityRequiredError,
  SilenceReasonRequiredError,
  StockItemPlanningNotFoundError,
} from "../../domain/errors.js";
import type {
  AcknowledgeAlertPort,
  BackfillDemandActualsPort,
  DetectForecastDeviationPort,
  GeneratePurchaseListPort,
  GetForecastHistoryPort,
  GetItemPlanningDetailPort,
  GetPlanningAlertDetailPort,
  ListPlanningAlertsPort,
  ListPlanningItemsPort,
  ReviewRecommendationPort,
  RunDailyForecastPort,
  SilenceAlertPort,
  SubmitForecastFeedbackPort,
} from "../../domain/ports/in/stock-planning.ports.js";

function handleError(e: unknown, res: import("express").Response): void {
  if (e instanceof StockItemPlanningNotFoundError || e instanceof PlanningAlertNotFoundError || e instanceof ForecastFeedbackNotFoundError || e instanceof RecommendationNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  if (e instanceof NoLatestForecastRunError) {
    res.status(409).json({ error: e.message });
    return;
  }
  if (
    e instanceof ReasonCodeRequiredError ||
    e instanceof SilenceReasonRequiredError ||
    e instanceof ReviewedQuantityRequiredError ||
    e instanceof NoActiveLocationError ||
    e instanceof ForecastFeedbackAlreadySubmittedError
  ) {
    res.status(400).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

function requireLocationId(req: import("express").Request, res: import("express").Response): string | null {
  const { locationId } = req.query as Record<string, string | undefined>;
  if (!locationId) {
    res.status(400).json({ error: "locationId é obrigatório" });
    return null;
  }
  return locationId;
}

export class StockPlanningController {
  readonly router: Router;

  constructor(
    private readonly listPlanningItems: ListPlanningItemsPort,
    private readonly getItemPlanningDetail: GetItemPlanningDetailPort,
    private readonly listPlanningAlerts: ListPlanningAlertsPort,
    private readonly getPlanningAlertDetail: GetPlanningAlertDetailPort,
    private readonly acknowledgeAlert: AcknowledgeAlertPort,
    private readonly silenceAlert: SilenceAlertPort,
    private readonly generatePurchaseList: GeneratePurchaseListPort,
    private readonly reviewRecommendation: ReviewRecommendationPort,
    private readonly submitForecastFeedback: SubmitForecastFeedbackPort,
    private readonly getForecastHistory: GetForecastHistoryPort,
    private readonly runDailyForecast: RunDailyForecastPort,
    private readonly backfillDemandActuals: BackfillDemandActualsPort,
    private readonly detectForecastDeviation: DetectForecastDeviationPort,
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.router.get("/stock-planning/items", async (req, res) => {
      try {
        const locationId = requireLocationId(req, res);
        if (!locationId) return;
        const { categoryId, supplierId, riskLevel, search } = req.query as Record<string, string | undefined>;
        const result = await this.listPlanningItems.execute({
          organizationId: req.auth!.orgId,
          locationId,
          ...(categoryId !== undefined && { categoryId }),
          ...(supplierId !== undefined && { supplierId }),
          ...(riskLevel !== undefined && { riskLevel: riskLevel as never }),
          ...(search !== undefined && { search }),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get("/stock-planning/items/:id", async (req, res) => {
      try {
        const locationId = requireLocationId(req, res);
        if (!locationId) return;
        const result = await this.getItemPlanningDetail.execute({ organizationId: req.auth!.orgId, locationId, stockItemId: req.params["id"] as string });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get("/stock-planning/alerts", async (req, res) => {
      try {
        const locationId = requireLocationId(req, res);
        if (!locationId) return;
        const { state, alertType } = req.query as Record<string, string | undefined>;
        const result = await this.listPlanningAlerts.execute({
          organizationId: req.auth!.orgId,
          locationId,
          ...(state !== undefined && { state: state as never }),
          ...(alertType !== undefined && { alertType: alertType as never }),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get("/stock-planning/alerts/:id", async (req, res) => {
      try {
        const result = await this.getPlanningAlertDetail.execute({ organizationId: req.auth!.orgId, alertId: req.params["id"] as string });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-planning/alerts/:id/acknowledge", async (req, res) => {
      try {
        const result = await this.acknowledgeAlert.execute({ organizationId: req.auth!.orgId, alertId: req.params["id"] as string, actor: req.auth!.email });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-planning/alerts/:id/silence", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
          res.status(400).json({ error: "reason é obrigatório" });
          return;
        }
        const result = await this.silenceAlert.execute({
          organizationId: req.auth!.orgId,
          alertId: req.params["id"] as string,
          reason: body.reason,
          ...(body.until !== undefined && { until: body.until as string | null }),
          actor: req.auth!.email,
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get("/stock-planning/purchase-list", async (req, res) => {
      try {
        const locationId = requireLocationId(req, res);
        if (!locationId) return;
        const result = await this.generatePurchaseList.execute({ organizationId: req.auth!.orgId, locationId });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-planning/recommendations/:id/review", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.reviewedQty !== "number") {
          res.status(400).json({ error: "reviewedQty é obrigatório (number)" });
          return;
        }
        await this.reviewRecommendation.execute({
          organizationId: req.auth!.orgId,
          recommendationId: req.params["id"] as string,
          reviewedQty: body.reviewedQty,
          ...(body.reason !== undefined && { reason: body.reason as string | null }),
          actor: req.auth!.email,
        });
        res.status(204).send();
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.post("/stock-planning/feedback/:id/submit", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.reasonCode !== "string" || body.reasonCode.trim().length === 0) {
          res.status(400).json({ error: "reasonCode é obrigatório" });
          return;
        }
        await this.submitForecastFeedback.execute({
          organizationId: req.auth!.orgId,
          feedbackId: req.params["id"] as string,
          reasonCode: body.reasonCode,
          ...(body.comment !== undefined && { comment: body.comment as string | null }),
          actor: req.auth!.email,
        });
        res.status(204).send();
      } catch (e) {
        handleError(e, res);
      }
    });

    this.router.get("/stock-planning/history", async (req, res) => {
      try {
        const locationId = requireLocationId(req, res);
        if (!locationId) return;
        const { limit } = req.query as Record<string, string | undefined>;
        const result = await this.getForecastHistory.execute({
          organizationId: req.auth!.orgId,
          locationId,
          ...(limit !== undefined && { limit: Number(limit) }),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    /** Permissão especial `stock.forecast_ops` (tabela central de rotas) — backfill único de ~90 dias (secção 4 do plano; pode demorar, ver README). */
    this.router.post("/stock-planning/backfill", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        if (typeof body.since !== "string" || typeof body.until !== "string") {
          res.status(400).json({ error: "since e until são obrigatórios (YYYY-MM-DD)" });
          return;
        }
        const result = await this.backfillDemandActuals.execute({
          organizationId: req.auth!.orgId,
          since: body.since,
          until: body.until,
          ...(body.locationId !== undefined && { locationId: body.locationId as string }),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    /** Permissão especial `stock.forecast_ops` (tabela central de rotas) — disparo manual do pipeline diário (o cron interno é o caminho normal). */
    this.router.post("/stock-planning/run-forecast", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.runDailyForecast.execute({
          organizationId: req.auth!.orgId,
          ...(body.locationId !== undefined && { locationId: body.locationId as string }),
          ...(body.dataCutoffDate !== undefined && { dataCutoffDate: body.dataCutoffDate as string }),
          ...(body.horizonDays !== undefined && { horizonDays: Number(body.horizonDays) }),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });

    /** Permissão especial `stock.forecast_ops` (tabela central de rotas) — disparo manual da deteção de desvio (o cron interno é o caminho normal). */
    this.router.post("/stock-planning/detect-deviation", async (req, res) => {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await this.detectForecastDeviation.execute({
          organizationId: req.auth!.orgId,
          ...(body.locationId !== undefined && { locationId: body.locationId as string }),
          ...(body.periodDate !== undefined && { periodDate: body.periodDate as string }),
        });
        res.json(result);
      } catch (e) {
        handleError(e, res);
      }
    });
  }
}
