import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ENV } from "../config/env.js";
import { getSupabaseServiceRole } from "../infra/supabaseClient.js";

// Supabase JWKS — suporta tanto HS256 (legacy) como ES256 (ECC P-256)
const JWKS = createRemoteJWKSet(
  new URL(`${ENV.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export type AppRole = "admin" | "manager" | "hr_viewer";

export interface AuthPayload {
  sub: string;
  email: string;
  app_role: AppRole;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

const ROLE_LEVEL: Record<AppRole, number> = {
  hr_viewer: 1,
  manager: 2,
  admin: 3,
};

async function lookupRole(userId: string): Promise<AppRole | null> {
  const sb = getSupabaseServiceRole();
  if (!sb) return null;
  const { data } = await sb
    .from("app_users")
    .select("role")
    .eq("id", userId)
    .single();
  const role = (data as { role?: string } | null)?.role;
  if (role === "admin" || role === "manager" || role === "hr_viewer") return role;
  return null;
}

async function extractAuth(req: Request): Promise<AuthPayload | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWKS);
    const sub = payload.sub as string;
    const email = payload["email"] as string;

    // Prefer the role injected by the custom_access_token_hook.
    // Fall back to a DB lookup when the hook is not yet configured.
    let role = payload["app_role"] as AppRole | undefined;
    if (!role) {
      role = (await lookupRole(sub)) ?? undefined;
    }
    if (!role) return null;

    return { sub, email, app_role: role };
  } catch {
    return null;
  }
}

/** Popula req.auth se houver JWT válido. Nunca bloqueia — usar requireAuth para isso. */
export async function populateAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = await extractAuth(req);
  if (auth !== null) {
    req.auth = auth;
  }
  next();
}

/** Bloqueia com 401 se não autenticado. */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.auth) {
    res.status(401).json({ error: "Autenticação necessária" });
    return;
  }
  next();
};

/** Bloqueia com 403 se o role do utilizador for inferior ao mínimo requerido. */
export function requireMinRole(minRole: AppRole): RequestHandler {
  const minLevel = ROLE_LEVEL[minRole];
  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ error: "Autenticação necessária" });
      return;
    }
    const userLevel = ROLE_LEVEL[req.auth.app_role] ?? 0;
    if (userLevel < minLevel) {
      res.status(403).json({ error: "Sem permissão para esta operação" });
      return;
    }
    next();
  };
}
