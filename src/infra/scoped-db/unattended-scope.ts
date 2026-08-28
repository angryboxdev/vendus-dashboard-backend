import { mintOrganizationId, type OrganizationId } from "../../kernel/organization-id.js";

/**
 * The unattended scope (D6/D14). The organization and location used by
 * every path with no authenticated user — the crons, the kiosk, the till
 * closing. Passed as an ordinary argument, like any other caller's.
 *
 * These are the same constants the tenancy schema pass
 * (`supabase/migrations/20260822150000_tenancy_schema_pass.sql`) used as the
 * column defaults for `org_id` and `location_id`: the Angrybox organization
 * and its first location. Today those defaults are what silently stamps
 * every unattended write; after this ticket they are still what gets
 * written, but as a named, explicit value instead of an invisible one — "which
 * paths still rely on it" becomes one grep over this file.
 *
 * TRIGGER: spec C (per-organization credentials and cron fan-out) is what
 * deletes this file — see spec.md D6. It replaces every one of this file's
 * consumers with real device/cron identity, one organization at a time.
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
