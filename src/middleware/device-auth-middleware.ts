import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createHash } from "node:crypto";
import { mintOrganizationId, type OrganizationId } from "../kernel/organization-id.js";
import type { UnattendedScope } from "../infra/scoped-db/unattended-scope.js";

/**
 * The device-auth middleware factory, decoupled from any concrete I/O
 * (mirrors `auth-middleware.ts`'s D10 seam). No import of the Supabase
 * client here — this is the file meant to be unit-tested with fakes; the
 * real lookup is wired in `device-auth.ts`, which imports from this file
 * rather than the other way around.
 */

/** Populated instead of `req.auth` — a device token carries no role or user (spec E D7). */
export interface DeviceAuthScope {
  organizationId: OrganizationId;
  locationId: string;
}

declare global {
  namespace Express {
    interface Request {
      deviceAuth?: DeviceAuthScope;
    }
  }
}

/** Row shape returned by the token lookup, before minting `OrganizationId`. */
export interface DeviceScopeRow {
  organizationId: string;
  locationId: string;
}

/** Looks up a token by its hash. Returns null for unknown AND revoked tokens alike — see resolveDeviceAuth. */
export type DeviceTokenLookup = (tokenHash: string) => Promise<DeviceScopeRow | null>;

/**
 * Outcome of the token-to-scope decision. Deliberately two-valued, not a
 * discriminated union naming *why* a token failed: a missing token, an
 * unknown token and a revoked token all collapse into "rejected" here, with
 * nothing to tell them apart (spec.md Testing Decisions; story 35). The
 * `UNATTENDED_SCOPE` fallback for a wholly absent token is NOT part of this
 * decision — it's added on top, in the wiring below, as ticket-01-only
 * scaffolding (D12).
 */
export type DeviceAuthResolution = { status: "ok"; scope: DeviceAuthScope } | { status: "rejected" };

function hashDeviceToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * The token-to-scope decision: the one piece of logic in this module worth
 * unit-testing on its own (mirrors `resolveAuth`). Pure aside from the
 * injected `lookupToken` — hashing has no I/O, so it happens inline rather
 * than through a collaborator, the same way `bearerToken(req)` isn't
 * injected in `auth-middleware.ts`.
 */
export async function resolveDeviceAuth(
  rawToken: string | null,
  lookupToken: DeviceTokenLookup,
): Promise<DeviceAuthResolution> {
  if (!rawToken) return { status: "rejected" };

  const row = await lookupToken(hashDeviceToken(rawToken));
  if (!row) return { status: "rejected" };

  return {
    status: "ok",
    scope: { organizationId: mintOrganizationId(row.organizationId), locationId: row.locationId },
  };
}

export const DEVICE_TOKEN_HEADER = "x-device-token";
/** KDS's `GET /kds/stream` exception — `EventSource` cannot set custom headers (D7/story 23). */
export const DEVICE_TOKEN_QUERY_PARAM = "device_token";

function extractDeviceToken(req: Request, allowQueryParam: boolean): string | null {
  const header = req.headers[DEVICE_TOKEN_HEADER];
  if (typeof header === "string" && header.length > 0) return header;
  if (allowQueryParam) {
    const query = req.query[DEVICE_TOKEN_QUERY_PARAM];
    if (typeof query === "string" && query.length > 0) return query;
  }
  return null;
}

export interface DeviceAuthMiddleware {
  /** Header transport — every route except the KDS SSE stream (D7). */
  requireDeviceAuth: RequestHandler;
  /**
   * Header-or-query transport, reserved for KDS's `GET /kds/stream`
   * (D7/story 23). Built and tested here; not wired into any route until
   * ticket 04 — using it elsewhere would silently widen every other route
   * to accept a token via query string too, which is not what D7 approved.
   */
  requireDeviceAuthAllowingQueryParam: RequestHandler;
}

/**
 * Factory taking the token lookup and the unattended-scope fallback as
 * injected collaborators (mirrors `createAuthMiddleware`'s D10 idiom). The
 * fallback is ticket-01-only scaffolding (D12): removed for kiosk,
 * till-closing and KDS specifically in ticket 06 — see the module README.
 */
export function createDeviceAuthMiddleware(deps: {
  lookupToken: DeviceTokenLookup;
  unattendedScope: UnattendedScope;
}): DeviceAuthMiddleware {
  const { lookupToken, unattendedScope } = deps;

  function makeHandler(allowQueryParam: boolean): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const token = extractDeviceToken(req, allowQueryParam);
      if (!token) {
        req.deviceAuth = {
          organizationId: unattendedScope.organizationId,
          locationId: unattendedScope.locationId,
        };
        next();
        return;
      }

      const resolution = await resolveDeviceAuth(token, lookupToken);
      if (resolution.status === "ok") {
        req.deviceAuth = resolution.scope;
        next();
        return;
      }
      res.status(401).json({ error: "Invalid or missing device credentials" });
    };
  }

  return {
    requireDeviceAuth: makeHandler(false),
    requireDeviceAuthAllowingQueryParam: makeHandler(true),
  };
}
