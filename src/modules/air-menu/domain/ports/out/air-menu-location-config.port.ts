import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AirMenuLocationConfig } from "../../entities/air-menu-location-config.js";

export type AirMenuLocationConfigResult =
  | { status: "found"; config: AirMenuLocationConfig }
  | { status: "not_configured" };

/**
 * Read-only, same rationale as `AirMenuCredentialsPort`. A missing row is
 * not an error — it's the current optional behaviour of
 * `AIRMENU_CLOSING_ENTERPRISE_ID` preserved: no config → delivery totals
 * stay null in a cash closing.
 */
export interface AirMenuLocationConfigPort {
  getByLocation(organizationId: OrganizationId, locationId: string): Promise<AirMenuLocationConfigResult>;
}
