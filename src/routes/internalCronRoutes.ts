import { ENV } from "../config/env.js";
import { Router, type Request, type Response } from "express";
import { runDailyVendusConsumptionJob } from "../services/dailyVendusConsumptionJobService.js";

export const internalCronRoutes = Router();

/**
 * POST /api/internal/cron/daily-vendus-consumption
 * Header: Authorization: Bearer <CRON_SECRET>
 * Body (opcional): { "target_date": "YYYY-MM-DD", "dry_run": false, "debug": false }
 *
 * Com `debug: true` → força dry_run e inclui `consumables_debug` no resultado
 * (detalhe por documento: canal detetado, smalls/larges, pratos/caixas/sacolas contados).
 *
 * Só registado quando CRON_SECRET está definido no ambiente.
 */
internalCronRoutes.post(
  "/internal/cron/daily-vendus-consumption",
  async (req: Request, res: Response) => {
    if (!ENV.CRON_SECRET) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${ENV.CRON_SECRET}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
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
