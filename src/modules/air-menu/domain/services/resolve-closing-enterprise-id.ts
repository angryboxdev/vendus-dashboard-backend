import type { AirMenuLocationConfigResult } from "../ports/out/air-menu-location-config.port.js";

/**
 * Pure resolution of `server.ts`'s bootstrap question: what closing
 * enterprise id (if any) feeds `createCashClosingsModule`? A missing config
 * row is not an error at this location — unlike missing credentials, which
 * fail boot loudly in `server.ts` itself — so this stays `null`, preserving
 * `AIRMENU_CLOSING_ENTERPRISE_ID`'s old optional behaviour (no config →
 * delivery totals stay null in a cash closing).
 */
export function resolveClosingEnterpriseId(result: AirMenuLocationConfigResult): string | null {
  return result.status === "found" ? result.config.closingEnterpriseId : null;
}
