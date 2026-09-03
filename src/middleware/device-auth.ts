import { UNATTENDED_SCOPE } from "../infra/scoped-db/unattended-scope.js";
import { findLocationTokenScopeByHash } from "../infra/scoped-db/device-token-lookup.js";
import { createDeviceAuthMiddleware } from "./device-auth-middleware.js";

export type {
  DeviceAuthMiddleware,
  DeviceAuthResolution,
  DeviceAuthScope,
  DeviceScopeRow,
  DeviceTokenLookup,
} from "./device-auth-middleware.js";
export {
  createDeviceAuthMiddleware,
  resolveDeviceAuth,
  DEVICE_TOKEN_HEADER,
  DEVICE_TOKEN_QUERY_PARAM,
} from "./device-auth-middleware.js";

// ---------------------------------------------------------------------------
// Real (production) collaborators. Kept in this file — rather than in
// device-auth-middleware.ts, which is the seam meant to be unit-tested —
// so that tests never touch the Supabase client (mirrors auth.ts/
// auth-middleware.ts's own split).
// ---------------------------------------------------------------------------

const defaultDeviceAuthMiddleware = createDeviceAuthMiddleware({
  lookupToken: findLocationTokenScopeByHash,
  unattendedScope: UNATTENDED_SCOPE,
});

export const requireDeviceAuth = defaultDeviceAuthMiddleware.requireDeviceAuth;
export const requireDeviceAuthAllowingQueryParam = defaultDeviceAuthMiddleware.requireDeviceAuthAllowingQueryParam;
