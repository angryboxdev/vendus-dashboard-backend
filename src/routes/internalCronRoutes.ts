import { ENV } from "../config/env.js";
import { Router, type Request, type Response } from "express";
import { runDailyVendusConsumptionJob } from "../services/dailyVendusConsumptionJobService.js";
import type { ProcessDirectDebitsPort } from "../modules/invoices/domain/ports/in/invoice.ports.js";
import type { ReprocessMissingStockReviewsPort } from "../modules/stock-purchase-review/domain/ports/in/stock-purchase-review.ports.js";
import type { DetectForecastDeviationPort, RunDailyForecastPort } from "../modules/stock-planning/domain/ports/in/stock-planning.ports.js";
import { UNATTENDED_SCOPE } from "../infra/scoped-db/unattended-scope.js";
import { fanOut } from "../utils/fan-out.js";
import type { OrganizationRow } from "../infra/scoped-db/organization-listing.js";

function requireCronSecret(req: Request, res: Response): boolean {
  if (!ENV.CRON_SECRET) {
    res.status(404).json({ error: "Not found" });
    return false;
  }
  if (req.headers.authorization !== `Bearer ${ENV.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function createInternalCronRouter(deps: {
  processDirectDebits: ProcessDirectDebitsPort;
  reprocessMissingStockReviews: ReprocessMissingStockReviewsPort;
  runDailyForecast: RunDailyForecastPort;
  detectForecastDeviation: DetectForecastDeviationPort;
  listOrganizations: () => Promise<OrganizationRow[]>;
}): Router {
  const router = Router();

  /**
   * POST /api/internal/cron/daily-vendus-consumption
   * Header: Authorization: Bearer <CRON_SECRET>
   * Body (opcional): { "target_date": "YYYY-MM-DD", "dry_run": false, "debug": false }
   */
  router.post(
    "/internal/cron/daily-vendus-consumption",
    async (req: Request, res: Response) => {
      if (!requireCronSecret(req, res)) return;
      try {
        const rawTarget =
          typeof req.body?.target_date === "string"
            ? req.body.target_date.trim()
            : "";
        const dryRun = req.body?.dry_run === true;
        const debug = req.body?.debug === true;
        const result = await runDailyVendusConsumptionJob(
          UNATTENDED_SCOPE.organizationId,
          rawTarget !== ""
            ? { targetDate: rawTarget, locationId: UNATTENDED_SCOPE.locationId, dryRun, debug }
            : { locationId: UNATTENDED_SCOPE.locationId, dryRun, debug }
        );
        res.json(result);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Erro no job";
        res.status(500).json({ error: message });
      }
    }
  );

  /**
   * POST /api/internal/cron/process-direct-debits
   * Header: Authorization: Bearer <CRON_SECRET>
   *
   * Processa faturas de débito direto cuja directDebitDate já passou, para
   * todas as organizações (ticket 02's fan-out utility + organization
   * listing). Sem caso de skip "não configurado" — este cron não depende de
   * credenciais Vendus/AirMenu; uma falha numa organização não impede o
   * processamento das restantes.
   */
  router.post(
    "/internal/cron/process-direct-debits",
    async (req: Request, res: Response) => {
      if (!requireCronSecret(req, res)) return;
      try {
        const organizations = await deps.listOrganizations();
        const summary = await fanOut(
          organizations,
          async (org) => {
            await deps.processDirectDebits.execute(org.organizationId);
            return { status: "success" as const };
          },
          { describeItem: (org) => org.organizationId },
        );
        res.json(summary);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Erro no job";
        res.status(500).json({ error: message });
      }
    }
  );

  /**
   * POST /api/internal/cron/reprocess-missing-stock-reviews
   * Header: Authorization: Bearer <CRON_SECRET>
   *
   * Rede de segurança do módulo `stock-purchase-review` (sem outbox formal
   * — ver README): reexecuta o caminho de decisão+criação de "Compra por
   * rever" para faturas finalizadas recentes sem revisão correspondente.
   * Sempre seguro correr redundantemente — a criação já é idempotente.
   */
  router.post(
    "/internal/cron/reprocess-missing-stock-reviews",
    async (req: Request, res: Response) => {
      if (!requireCronSecret(req, res)) return;
      try {
        const organizations = await deps.listOrganizations();
        const summary = await fanOut(
          organizations,
          async (org) => {
            const result = await deps.reprocessMissingStockReviews.execute({ organizationId: org.organizationId });
            return { status: "success" as const, ...result };
          },
          { describeItem: (org) => org.organizationId },
        );
        res.json(summary);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Erro no job";
        res.status(500).json({ error: message });
      }
    }
  );

  /**
   * POST /internal/cron/run-daily-forecast
   * Header: Authorization: Bearer <CRON_SECRET>
   *
   * Módulo `stock-planning` — pipeline diário completo (incrementa vendas,
   * prevê, converte para consumo, projeta stock, gera recomendações e
   * alertas) seguido da deteção de desvio do dia anterior (mesmo cron,
   * passo adicional — secções 31-38). Fan-out por organização, mesmo
   * padrão de `reprocess-missing-stock-reviews`. Sempre seguro correr
   * redundantemente — escrita idempotente por construção (`is_latest`
   * flip, upsert de alertas/feedback por fingerprint/chave única).
   */
  router.post(
    "/internal/cron/run-daily-forecast",
    async (req: Request, res: Response) => {
      if (!requireCronSecret(req, res)) return;
      try {
        const organizations = await deps.listOrganizations();
        const summary = await fanOut(
          organizations,
          async (org) => {
            const forecastResult = await deps.runDailyForecast.execute({ organizationId: org.organizationId });
            const deviationResult = await deps.detectForecastDeviation.execute({ organizationId: org.organizationId });
            return { status: "success" as const, forecastResult, deviationResult };
          },
          { describeItem: (org) => org.organizationId },
        );
        res.json(summary);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Erro no job";
        res.status(500).json({ error: message });
      }
    }
  );

  return router;
}
