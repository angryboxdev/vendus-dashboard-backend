/**
 * Job: aplicar consumo Vendus do dia anterior como movimentos de stock (saídas).
 *
 * Uso:
 *   npm run build && npm run cron:daily-vendus-consumption
 *   TARGET_DATE=2025-02-04 npm run cron:daily-vendus-consumption
 *   CRON_DRY_RUN=1 npm run cron:daily-vendus-consumption
 *
 * Dev (sem build):
 *   npx tsx src/jobs/runDailyVendusConsumption.ts
 */
import "../config/env.js";
import { runDailyVendusConsumptionJob } from "../services/dailyVendusConsumptionJobService.js";
import { UNATTENDED_SCOPE } from "../infra/scoped-db/unattended-scope.js";

const dryRun =
  process.env.CRON_DRY_RUN === "1" || process.env.CRON_DRY_RUN === "true";
const targetDate = process.env.TARGET_DATE?.trim();

const jobOpts =
  targetDate !== undefined && targetDate !== ""
    ? { targetDate, dryRun }
    : { dryRun };

runDailyVendusConsumptionJob(UNATTENDED_SCOPE.organizationId, jobOpts)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
