import { ENV } from "../config/env.js";
import { Router, type Request, type Response } from "express";
import { runDailyVendusConsumptionJob } from "../services/dailyVendusConsumptionJobService.js";
import type { ProcessDirectDebitsPort } from "../modules/invoices/domain/ports/in/invoice.ports.js";
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

  return router;
}
