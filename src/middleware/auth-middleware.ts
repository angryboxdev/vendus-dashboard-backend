import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * The auth middleware factory, decoupled from any concrete I/O (D10).
 *
 * Deliberately has no import of `jose` or the Supabase client: this is the
 * seam meant to be unit-tested with fakes, and importing either of those
 * here would drag real network/DB machinery (and `jose`'s ESM-only build)
 * into that test. The real collaborators are wired in `auth.ts`, which
 * imports from this file rather than the other way around.
 */

export type AppRole = "admin" | "manager" | "hr_viewer";

/** Auth payload attached to every authenticated request. */
export interface AuthPayload {
  sub: string;
  email: string;
  /** Verified organization this request is acting for (D11). */
  orgId: string;
  /** Role held within `orgId` — org-scoped, per ADR-0003. */
  orgRole: AppRole;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      /**
       * Set instead of `auth` when the subject is a valid, verified identity
       * but membership is ambiguous (zero or two-or-more `org_members` rows).
       * Lets `requireAuth` distinguish this refusal from an ordinary
       * authentication failure — see D5/D10.
       */
      authRefusal?: "ambiguous-membership";
    }
  }
}

const ROLE_LEVEL: Record<AppRole, number> = {
  hr_viewer: 1,
  manager: 2,
  admin: 3,
};

/** Claims pulled out of a verified token, before the org/role decision is applied. */
export interface VerifiedClaims {
  sub: string;
  email: string;
  /** Present only when the token itself carries the `org_id` claim. */
  orgId?: string;
  /** Present only when the token itself carries the `org_role` claim. */
  role?: AppRole;
}

/** Verifies a bearer token and extracts its claims. Returns null when invalid. */
export type TokenVerifier = (token: string) => Promise<VerifiedClaims | null>;

export interface Membership {
  orgId: string;
  role: AppRole;
}

/**
 * Resolves a user's organization membership. Must return null for BOTH zero
 * and two-or-more memberships — D5's unambiguity rule ("exactly one, or
 * nothing") collapsed deliberately into a single falsy case.
 */
export type MembershipLookup = (userId: string) => Promise<Membership | null>;

/**
 * Outcome of the claim-to-payload decision (D10). Kept as a discriminated
 * union rather than `AuthPayload | null` so the ambiguous-membership refusal
 * stays distinguishable from an ordinary auth failure all the way out to the
 * HTTP response and the logs.
 */
export type AuthResolution =
  | { status: "ok"; payload: AuthPayload }
  | { status: "no-auth" }
  | { status: "ambiguous-membership"; sub: string };

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

/**
 * The claim-to-payload decision: the one piece of logic in this module worth
 * unit-testing (D10). Pure aside from the two injected collaborators — no
 * `req`/`res`, no console, no I/O of its own.
 */
export async function resolveAuth(
  token: string | null,
  verifyToken: TokenVerifier,
  lookupMembership: MembershipLookup,
): Promise<AuthResolution> {
  if (!token) return { status: "no-auth" };

  const claims = await verifyToken(token);
  if (!claims) return { status: "no-auth" };

  // Token already carries the org + role claims (custom_access_token_hook
  // injected them) — trust it directly, no membership lookup.
  if (claims.orgId && claims.role) {
    return {
      status: "ok",
      payload: {
        sub: claims.sub,
        email: claims.email,
        orgId: claims.orgId,
        orgRole: claims.role,
      },
    };
  }

  // Hook not configured / claims missing — fall back to org_members,
  // applying the same unambiguity rule.
  const membership = await lookupMembership(claims.sub);
  if (!membership) return { status: "ambiguous-membership", sub: claims.sub };

  return {
    status: "ok",
    payload: {
      sub: claims.sub,
      email: claims.email,
      orgId: membership.orgId,
      orgRole: membership.role,
    },
  };
}

export interface AuthMiddleware {
  /** Popula req.auth (ou req.authRefusal) se houver JWT. Nunca bloqueia. */
  populateAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  /** Bloqueia com 401 se não autenticado; 403 distinguível se a organização for ambígua. */
  requireAuth: RequestHandler;
  /** Bloqueia com 403 se o role do utilizador for inferior ao mínimo requerido. */
  requireMinRole: (minRole: AppRole) => RequestHandler;
}

/**
 * Factory taking token verification and membership lookup as injected
 * collaborators (D10), matching the constructor-injection idiom the
 * hexagonal modules already use. This is the only new seam the spec
 * introduces — see `.scratch/tenant-identity/issues/03-*.md`.
 */
export function createAuthMiddleware(deps: {
  verifyToken: TokenVerifier;
  lookupMembership: MembershipLookup;
}): AuthMiddleware {
  const { verifyToken, lookupMembership } = deps;

  const populateAuth = async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const resolution = await resolveAuth(bearerToken(req), verifyToken, lookupMembership);
    if (resolution.status === "ok") {
      req.auth = resolution.payload;
    } else if (resolution.status === "ambiguous-membership") {
      req.authRefusal = "ambiguous-membership";
    }
    next();
  };

  const requireAuth: RequestHandler = (req, res, next) => {
    if (req.auth) {
      next();
      return;
    }
    if (req.authRefusal === "ambiguous-membership") {
      console.warn(
        `[auth] AMBIGUOUS_ORG_MEMBERSHIP: refusing request — subject has zero or multiple org_members rows`,
      );
      res.status(403).json({
        error: "Não foi possível determinar uma organização única para este utilizador",
        code: "AMBIGUOUS_ORG_MEMBERSHIP",
      });
      return;
    }
    res.status(401).json({ error: "Autenticação necessária" });
  };

  const requireMinRole = (minRole: AppRole): RequestHandler => {
    const minLevel = ROLE_LEVEL[minRole];
    return (req, res, next) => {
      if (!req.auth) {
        if (req.authRefusal === "ambiguous-membership") {
          console.warn(
            `[auth] AMBIGUOUS_ORG_MEMBERSHIP: refusing request — subject has zero or multiple org_members rows`,
          );
          res.status(403).json({
            error: "Não foi possível determinar uma organização única para este utilizador",
            code: "AMBIGUOUS_ORG_MEMBERSHIP",
          });
          return;
        }
        res.status(401).json({ error: "Autenticação necessária" });
        return;
      }
      const userLevel = ROLE_LEVEL[req.auth.orgRole] ?? 0;
      if (userLevel < minLevel) {
        res.status(403).json({ error: "Sem permissão para esta operação" });
        return;
      }
      next();
    };
  };

  return { populateAuth, requireAuth, requireMinRole };
}
