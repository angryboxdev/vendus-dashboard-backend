import { ENV } from "../config/env.js";
import { Router, type Request, type Response } from "express";
import { runDailyVendusConsumptionJob } from "../services/dailyVendusConsumptionJobService.js";
import type { ProcessDirectDebitsPort } from "../modules/invoices/domain/ports/in/invoice.ports.js";
import { UNATTENDED_SCOPE } from "../infra/scoped-db/unattended-scope.js";

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
          rawTarget !== ""
            ? { targetDate: rawTarget, dryRun, debug }
            : { dryRun, debug }
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
   * Processa faturas de débito direto cuja directDebitDate já passou.
   * Marca-as como pagas e sincroniza os payable entries correspondentes.
   */
  router.post(
    "/internal/cron/process-direct-debits",
    async (req: Request, res: Response) => {
      if (!requireCronSecret(req, res)) return;
      try {
        const result = await deps.processDirectDebits.execute(UNATTENDED_SCOPE.organizationId);
        res.json(result);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Erro no job";
        res.status(500).json({ error: message });
      }
    }
  );

  return router;
}
