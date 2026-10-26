import type { RequestHandler } from "express";
import { problem } from "../../../../infra/http/problem-details.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { isStockDemoScenario, type StockDemoScenario } from "../../domain/entities/stock-demo.js";

export const STOCK_DEMO_HEADER = "x-stock-demo";

/** Rotas da Gestão de Stock que passam a agir na organização fictícia. Mais nenhuma (o RH e o resto ignoram). */
const STOCK_PREFIXES = [
  "/api/stock/",
  "/api/stock-count",
  "/api/stock-purchase-reviews",
  "/api/stock-planning",
  "/api/pizzas",
  "/api/preparations",
  "/api/recipe-costing",
  "/api/reports/ingredient-consumption",
  "/api/stock-demo/pos",
];
/** Só leitura, para os nomes que os ecrãs do Stock mostram (lojas, fornecedores). */
const STOCK_READ_PREFIXES = ["/api/locations", "/api/financial-base/suppliers"];
/** Leitura de faturas reais / IA: nunca numa demonstração. */
const BLOCKED = ["/api/invoices/import-for-stock", "/api/stock/invoice-imports"];

export function isStockDemoPath(path: string, method: string): boolean {
  if (STOCK_PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p))) return true;
  return method === "GET" && STOCK_READ_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));
}

/**
 * Modo Demonstração do Stock. Com `X-Stock-Demo: <cenário>`, um pedido de um Admin a uma rota da Gestão de
 * Stock passa a agir na organização fictícia desse cenário. Corre depois de loadAccess / routeGuard /
 * requireMfa (as permissões verificadas são as do Admin na empresa real). Fora do Stock o cabeçalho é
 * ignorado. Independente do modo Demonstração do RH.
 */
export function stockDemoContext(resolve: (realOrg: OrganizationId, scenario: StockDemoScenario) => Promise<OrganizationId | null>): RequestHandler {
  return async (req, res, next) => {
    const raw = req.get(STOCK_DEMO_HEADER)?.trim().toLowerCase();
    if (!raw || !req.auth) return next();
    try {
      if (BLOCKED.some((p) => req.path.startsWith(p))) throw problem(403, "stock_demo_blocked", "Em demonstração não se importam faturas reais.");
      if (!isStockDemoPath(req.path, req.method)) return next();
      if (!isStockDemoScenario(raw)) throw problem(400, "stock_demo_unknown_scenario", "Cenário de demonstração desconhecido.");
      if (!req.access?.isAdmin) throw problem(403, "stock_demo_admin_only", "A demonstração do Stock está disponível só para Admins.");
      const demo = await resolve(req.auth.orgId, raw);
      if (!demo) throw problem(409, "stock_demo_not_created", "Este cenário de demonstração ainda não foi criado.");
      req.auth = { ...req.auth, orgId: demo };
      res.setHeader("X-Stock-Demo", raw);
      next();
    } catch (e) {
      next(e);
    }
  };
}
