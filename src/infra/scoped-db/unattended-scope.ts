import { mintOrganizationId, type OrganizationId } from "../../kernel/organization-id.js";

/**
 * The unattended scope (D6/D14). The organization and location used by
 * every path with no authenticated user. Passed as an ordinary argument,
 * like any other caller's.
 *
 * These are the same constants the tenancy schema pass
 * (`supabase/migrations/20260822150000_tenancy_schema_pass.sql`) used as the
 * column defaults for `org_id` and `location_id`: the Angrybox organization
 * and its first location. Today those defaults are what silently stamps
 * every unattended write; this file is what gets written instead, but as a
 * named, explicit value instead of an invisible one — "which paths still
 * rely on it" becomes one grep over this file.
 *
 * Two consumer groups have already been replaced with real identity, each
 * by its own spec's closing ticket:
 *  - Kiosk, till-closing and KDS resolve a real, per-Location, revocable
 *    token instead (`requireDeviceAuth` — `location-credentials` ticket 06,
 *    see `docs/adr/0010` and ADR-0009's amendment).
 *  - The `process-direct-debits` cron fans out over every organization
 *    instead of running once for this one (`org-integration-credentials`
 *    ticket 06, see `docs/adr/0014`).
 *
 * Genuine remaining consumers of this file:
 *  - The `daily-vendus-consumption` cron — `org-integration-credentials`
 *    ticket 05 for its own fan-out conversion is **won't-do**: the cron is
 *    disabled (`ENV.ENABLE_DAILY_CONSUMPTION_CRON`, off by default) with no
 *    plan to re-enable it, so it was left on this scope rather than
 *    converted. It's read from three sites: the standalone script
 *    (`src/jobs/runDailyVendusConsumption.ts`), the HTTP route
 *    (`src/routes/internalCronRoutes.ts`), and `server.ts`'s own in-process
 *    `node-cron` schedule.
 *  - `server.ts`'s one-time, boot-time resolution of Vendus/AirMenu
 *    credentials — reads this scope once at startup to load Angrybox's row
 *    before any route is mounted. This is inherent to there being exactly
 *    one organization's credentials to seed before a second organization
 *    exists, not the "which organization does this scheduled run belong to"
 *    problem the crons above had — so it wasn't in `org-integration-
 *    credentials`'s scope to replace.
 *  - `src/jobs/runStockAdjustmentFromLines.ts` and
 *    `src/jobs/resetStockMovements.ts` — manual, human-invoked scripts;
 *    whoever runs them already knows which organization/location they mean
 *    (`org-integration-credentials` spec, "Explicitly out of scope").
 *  - `src/jobs/runVendusCredentialsCutover.ts` and
 *    `runAirMenuCredentialsCutover.ts` — this spec's own one-time cutover
 *    scripts, which seed Angrybox's row using this scope by design (there is
 *    exactly one organization to cut over today).
 *
 * This file is not scheduled for deletion by any currently-planned ticket;
 * the entries above are its known, named audience.
 */

const UNATTENDED_ORGANIZATION_ID = "b6999cff-79b2-4583-b8b4-a744b3ace748";
const UNATTENDED_LOCATION_ID = "c11d9146-fe16-4afb-9877-75e75bb2f52a";

export interface UnattendedScope {
  readonly organizationId: OrganizationId;
  readonly locationId: string;
}

export const UNATTENDED_SCOPE: UnattendedScope = {
  organizationId: mintOrganizationId(UNATTENDED_ORGANIZATION_ID),
  locationId: UNATTENDED_LOCATION_ID,
};
