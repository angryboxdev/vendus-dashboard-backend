import type { Request, Router } from "express";
import { log } from "../../infra/http/correlation.js";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { createDashboardRouter } from "./adapters/in/dashboard.controller.js";
import { MemoryDashboardCache } from "./adapters/out/memory-dashboard-cache.js";
import { SupabaseDashboardLayoutRepository } from "./adapters/out/supabase-dashboard-layout.repository.js";
import { DashboardUseCases } from "./application/use-cases/dashboard.use-cases.js";
import type { DashboardCachePort, DashboardSourcesPort, DashboardViewer } from "./domain/ports/out/dashboard.ports.js";

/**
 * Composition root do Dashboard executivo do Novo RH. Só leitura e
 * agregação: as fontes (painel, caixa de pedidos, escalas, pessoas) vêm do
 * server.ts; o único dado próprio é o layout pessoal.
 */
export function createDashboardModule(deps: { sources: DashboardSourcesPort; viewerOf: (req: Request) => Promise<DashboardViewer> }): {
  router: Router;
  dashboard: DashboardUseCases;
  cache: DashboardCachePort;
} {
  const cache = new MemoryDashboardCache();
  const dashboard = new DashboardUseCases(deps.sources, new SupabaseDashboardLayoutRepository(createScopedQuery), cache, (source, error) =>
    log("error", "dashboard.source_failed", { source, message: error instanceof Error ? error.message : String(error) }),
  );
  return { router: createDashboardRouter(dashboard, deps.viewerOf), dashboard, cache };
}
