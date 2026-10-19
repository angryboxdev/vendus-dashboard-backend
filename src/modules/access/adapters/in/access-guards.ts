import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { RequestHandler } from "express";
import type { AccessLevel } from "../../domain/catalog.js";
import type { AccessContext, ResolveAccessPort } from "../../domain/ports/in/resolve-access.port.js";
import { can } from "../../domain/services/effective-access.service.js";
import { classifyRoute, isRouteAllowed, mfaRequired, sessionRevoked, type MfaEnforcement } from "../../domain/route-permissions.js";
import { problem, sendProblem } from "../../../../infra/http/problem-details.js";

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
  /**
   * Global, depois do `routeGuard`: perfis de gestão sem MFA (`aal2`) → 403
   * `mfa_required` nas rotas abrangidas por `MFA_ENFORCEMENT` (TK-3).
   */
  requireMfa: RequestHandler;
}

export function createAccessGuards(
  resolveAccess: ResolveAccessPort,
  options: {
    mfa: MfaEnforcement;
    /** A empresa ligou a MFA (`security.mfa.required`)? Sem isto, vale só `mfa` (comportamento antigo). */
    orgRequiresMfa?: (org: OrganizationId) => Promise<boolean>;
  } = { mfa: "off" },
): AccessGuards {
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
      // TK-4: perfil/estado mudou depois de este token ser emitido → entrar de novo.
      if (sessionRevoked(access.sessionsRevokedAt, req.auth.issuedAt)) {
        sendProblem(res, problem(401, "session_revoked", "O seu acesso foi alterado. Entre de novo.", { code: "SESSION_REVOKED" }).problem);
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
    const allowed = !!access && isRouteAllowed(access, req.method, path);
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

  const requireMfa: RequestHandler = async (req, res, next) => {
    const path = req.originalUrl.split("?")[0] ?? "";
    if (!req.auth || !req.access || !mfaRequired(req.access, path, options.mfa) || req.auth.aal === "aal2") {
      next();
      return;
    }
    // Opcional por empresa: desligada nas Configurações → não se exige.
    try {
      if (options.orgRequiresMfa && !(await options.orgRequiresMfa(req.auth.orgId))) {
        next();
        return;
      }
    } catch (e) {
      next(e);
      return;
    }
    sendProblem(res, problem(403, "mfa_required", "Esta área exige autenticação de dois fatores.", { code: "MFA_REQUIRED" }).problem);
  };

  return { loadAccess, requirePermission, requireAdmin, routeGuard, requireMfa };
}
