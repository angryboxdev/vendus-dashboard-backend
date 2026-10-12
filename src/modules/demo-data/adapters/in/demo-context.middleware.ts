import type { RequestHandler } from "express";
import { problem } from "../../../../infra/http/problem-details.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

export const DEMO_MODE_HEADER = "x-novo-rh-mode";
const NOVO_RH = "/api/novo-rh/";
const DEMO_ADMIN = "/api/novo-rh/demo";

/**
 * Modo Demonstração do Novo RH (ADR-0034). Com `X-Novo-RH-Mode: demo`, um
 * pedido a `/api/novo-rh/*` de um Admin da organização real passa a agir na
 * organização de demonstração ligada a ela. Corre depois de loadAccess /
 * routeGuard / requireMfa: as permissões verificadas são as do Admin na
 * organização real. Fora do Novo RH o cabeçalho é ignorado — os restantes
 * módulos (e o modo Real) nunca veem a organização fictícia.
 */
export function demoContext(
  resolve: (realOrg: OrganizationId) => Promise<OrganizationId | null>,
  /** Chamado em segundo plano a cada pedido em Demonstração (mantém os dados em dia); erros não afetam o pedido. */
  touch: (realOrg: OrganizationId, actor: { userId: string; email: string }) => void = () => {},
): RequestHandler {
  return async (req, res, next) => {
    if (req.get(DEMO_MODE_HEADER)?.trim().toLowerCase() !== "demo") return next();
    if (!req.path.startsWith(NOVO_RH) || req.path === DEMO_ADMIN || req.path.startsWith(`${DEMO_ADMIN}/`) || !req.auth) return next();
    try {
      if (!req.access?.isAdmin) throw problem(403, "demo_admin_only", "O modo Demonstração está disponível só para Admins.");
      const demo = await resolve(req.auth.orgId);
      if (!demo) throw problem(409, "demo_not_created", "A organização de demonstração ainda não foi criada.");
      touch(req.auth.orgId, { userId: req.auth.sub, email: req.auth.email || req.auth.sub });
      req.auth = { ...req.auth, orgId: demo };
      res.setHeader("X-Novo-RH-Mode", "demo");
      next();
    } catch (e) {
      next(e);
    }
  };
}
