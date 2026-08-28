import { createRemoteJWKSet, jwtVerify } from "jose";
import { ENV } from "../config/env.js";
import { listMembershipsForUser } from "../infra/scoped-db/membership-lookup.js";
import {
  createAuthMiddleware,
  type AppRole,
  type MembershipLookup,
  type TokenVerifier,
  type VerifiedClaims,
} from "./auth-middleware.js";

export type {
  AppRole,
  AuthMiddleware,
  AuthPayload,
  AuthResolution,
  Membership,
  MembershipLookup,
  TokenVerifier,
  VerifiedClaims,
} from "./auth-middleware.js";
export { createAuthMiddleware, resolveAuth } from "./auth-middleware.js";

// ---------------------------------------------------------------------------
// Real (production) collaborators. Kept in this file — rather than in
// auth-middleware.ts, which is the seam meant to be unit-tested — so that
// tests never touch `jose` (ESM-only, doesn't parse under ts-jest's CJS
// transform) or the Supabase client.
// ---------------------------------------------------------------------------

// Supabase JWKS — lazy para não crashar se SUPABASE_URL não estiver definido.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!_jwks) {
    if (!ENV.SUPABASE_URL) throw new Error("SUPABASE_URL não está definido");
    _jwks = createRemoteJWKSet(
      new URL(`${ENV.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
    );
  }
  return _jwks;
}

function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "manager" || value === "hr_viewer";
}

const verifyTokenViaJwks: TokenVerifier = async (token) => {
  try {
    const { payload } = await jwtVerify(token, getJWKS());
    const sub = payload.sub as string;
    const email = payload["email"] as string;
    const orgId = payload["org_id"] as string | undefined;
    const roleClaim = payload["org_role"];
    const role = isAppRole(roleClaim) ? roleClaim : undefined;
    const claims: VerifiedClaims = { sub, email };
    if (orgId) claims.orgId = orgId;
    if (role) claims.role = role;
    return claims;
  } catch {
    return null;
  }
};

/**
 * Membership fallback against `org_members`, applying D5's unambiguity rule
 * on top of the one unscoped door (D10) — `listMembershipsForUser` reads
 * every row for the user with no organization filter, because no
 * organization is known yet; this function is what collapses that to
 * "exactly one, or refuse".
 */
const lookupMembershipInDb: MembershipLookup = async (userId) => {
  const rows = await listMembershipsForUser(userId);
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  if (!row.organizationId || !isAppRole(row.role)) return null;
  return { orgId: row.organizationId, role: row.role };
};

const defaultAuthMiddleware = createAuthMiddleware({
  verifyToken: verifyTokenViaJwks,
  lookupMembership: lookupMembershipInDb,
});

export const populateAuth = defaultAuthMiddleware.populateAuth;
export const requireAuth = defaultAuthMiddleware.requireAuth;
export const requireMinRole = defaultAuthMiddleware.requireMinRole;
