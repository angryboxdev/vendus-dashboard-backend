import type { RequestHandler } from "express";
import type { AccessLevel } from "../../domain/catalog.js";
import type { AccessContext, ResolveAccessPort } from "../../domain/ports/in/resolve-access.port.js";
import { can } from "../../domain/services/effective-access.service.js";
import { classifyRoute } from "../../domain/route-permissions.js";

declare global {
  namespace Express {
    interface Request {
      /** Acesso efetivo do utilizador autenticado (perfil + exceções + estado), resolvido da BD por pedido. */
      access?: AccessContext;
    }
  }
}

export interface AccessGuards {
  /** Global, logo a seguir a `requireAuth`: carrega `req.access`; conta desativada → 403 no pedido seguinte. */
  loadAccess: RequestHandler;
  /** A verificação única por rota (task §15): `can(user, permissão, nível)`. */
  requirePermission: (key: string, level: Exclude<AccessLevel, "NONE">) => RequestHandler;
  /** Utilizadores & Perfis — exclusivo do Admin. */
  requireAdmin: RequestHandler;
  /**
   * Global, depois de `loadAccess`: aplica a tabela central rota → permissão
   * (`route-permissions.ts`) a TODO o `/api` autenticado. Rota não
   * classificada → 403 (falha fechada).
   */
  routeGuard: RequestHandler;
}

export function createAccessGuards(resolveAccess: ResolveAccessPort): AccessGuards {
  const loadAccess: RequestHandler = async (req, res, next) => {
    if (!req.auth) {
      next();
      return;
    }
    try {
      const access = await resolveAccess.execute(req.auth.orgId, req.auth.sub);
      if (!access) {
        res.status(403).json({ error: "Sem permissão para esta operação" });
        return;
      }
      if (!access.active) {
        res.status(403).json({ error: "Esta conta está desativada", code: "USER_DISABLED" });
        return;
      }
      req.access = access;
      next();
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Erro ao verificar permissões" });
    }
  };

  const requirePermission = (key: string, level: Exclude<AccessLevel, "NONE">): RequestHandler => {
    return (req, res, next) => {
      if (req.access && can(req.access, key, level)) {
        next();
        return;
      }
      res.status(403).json({ error: "Sem permissão para esta operação", code: "FORBIDDEN", permission: key, level });
    };
  };

  const requireAdmin: RequestHandler = (req, res, next) => {
    if (req.access?.active && req.access.isAdmin) {
      next();
      return;
    }
    res.status(403).json({ error: "Só um Admin pode gerir utilizadores e perfis", code: "FORBIDDEN" });
  };

  const routeGuard: RequestHandler = (req, res, next) => {
    if (!req.auth) {
      next();
      return;
    }
    const path = req.originalUrl.split("?")[0] ?? "";
    const { target, level } = classifyRoute(req.method, path);
    const access = req.access;
    const allowed =
      !!access &&
      access.active &&
      !!target &&
      (target.kind === "portal" ||
        (target.kind === "base" && !access.portalOnly) ||
        (target.kind === "admin" && access.isAdmin) ||
        (target.kind === "permission" && can(access, target.key, level)));
    if (allowed) {
      next();
      return;
    }
    res.status(403).json({
      error: "Sem permissão para esta operação",
      code: target ? "FORBIDDEN" : "ROUTE_NOT_CLASSIFIED",
      ...(target?.kind === "permission" && { permission: target.key, level }),
    });
  };

  return { loadAccess, requirePermission, requireAdmin, routeGuard };
}
