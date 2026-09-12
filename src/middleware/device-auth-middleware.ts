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

/**
 * Looks up a token by its hash. Returns null for unknown AND revoked tokens
 * alike — see resolveDeviceAuth. Must reject/throw on a genuine lookup
 * error (DB timeout, connection blip, etc.) rather than returning null for
 * it — that error is not a "token rejected" outcome and must not be
 * reported as one.
 */
export type DeviceTokenLookup = (tokenHash: string) => Promise<DeviceScopeRow | null>;

/**
 * Outcome of the token-to-scope decision. Deliberately two-valued, not a
 * discriminated union naming *why* a token failed: a missing token, an
 * unknown token and a revoked token all collapse into "rejected" here, with
 * nothing to tell them apart (spec.md Testing Decisions; story 35). Ticket
 * 01 through 05 added an `UNATTENDED_SCOPE` fallback on top of this, for a
 * wholly absent token, as expand-and-contract scaffolding (D12); ticket 06
 * removes it — a missing token is rejected the same as an unknown or
 * revoked one, unconditionally.
 *
 * A genuine lookup error is NOT a third member of this union — it is not a
 * "rejected" outcome at all. `resolveDeviceAuth` lets `lookupToken`'s
 * rejection propagate instead of catching it, so it never reaches this type;
 * the caller (`createDeviceAuthMiddleware`) sees the throw and responds with
 * something other than the 401 device-auth-failure shape.
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
  if (!rawToken) {
    console.warn(`[device-auth] rejected — reason=${rawToken ? "unknown_or_revoked" : "missing"}`);
    return { status: "rejected" };
  }

  const row = await lookupToken(hashDeviceToken(rawToken));
  if (!row) {
    console.warn(`[device-auth] rejected — reason=${rawToken ? "unknown_or_revoked" : "missing"}`);
    return { status: "rejected" };
  }

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
 * Factory taking the token lookup as an injected collaborator (mirrors
 * `createAuthMiddleware`'s D10 idiom). Ticket 01 through 05 also injected an
 * `unattendedScope` fallback here as expand-and-contract scaffolding (D12).
 * Ticket 06 removed it: kiosk, till-closing and KDS are this middleware's
 * only consumers (crons build `UNATTENDED_SCOPE` directly — see
 * `internalCronRoutes.ts` — and never go through this middleware), so making
 * the token mandatory here was the whole change, with nothing left to
 * parameterize per-consumer.
 *
 * `bypassScope` (2026-09) is a second, unrelated, opt-in escape hatch — a
 * manual last-resort kill-switch, not a return of ticket 06's scaffolding.
 * It is undefined by default (off), and when provided it applies to *any*
 * `"rejected"` resolution — missing, unknown or revoked token alike — not
 * only a missing one, because it exists to cover a *present* token being
 * wrongly rejected. See
 * `src/modules/location-credentials/README.md` for why it exists and how to
 * enable it. `resolveDeviceAuth`'s own two-outcome contract is untouched —
 * the bypass is applied here, in `makeHandler`, after that decision.
 */
export function createDeviceAuthMiddleware(deps: {
  lookupToken: DeviceTokenLookup;
  bypassScope?: UnattendedScope;
}): DeviceAuthMiddleware {
  const { lookupToken, bypassScope } = deps;

  function makeHandler(allowQueryParam: boolean): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // No try/catch: a genuine lookup error rejects this promise, and
      // Express 5 forwards that rejection to the default error handler
      // (500), the same way `populateAuth` relies on it elsewhere. Only a
      // resolved "rejected" outcome — missing/unknown/revoked — gets the
      // 401 device-auth-failure shape below (or the bypass, if armed).
      const token = extractDeviceToken(req, allowQueryParam);
      const resolution = await resolveDeviceAuth(token, lookupToken);
      if (resolution.status === "ok") {
        req.deviceAuth = resolution.scope;
        next();
        return;
      }
      if (bypassScope) {
        console.warn(
          `[device-auth] BYPASS ACTIVE — accepting rejected token as UNATTENDED_SCOPE (org=${bypassScope.organizationId}, location=${bypassScope.locationId})`,
        );
        req.deviceAuth = { organizationId: bypassScope.organizationId, locationId: bypassScope.locationId };
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
