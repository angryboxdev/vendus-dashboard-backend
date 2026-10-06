import type { RequestHandler } from "express";
import type { AccessLevel } from "../../domain/catalog.js";
import type { AccessContext, ResolveAccessPort } from "../../domain/ports/in/resolve-access.port.js";
import { can } from "../../domain/services/effective-access.service.js";

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

  return { loadAccess, requirePermission, requireAdmin };
}
