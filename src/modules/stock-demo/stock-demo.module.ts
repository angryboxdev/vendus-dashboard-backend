import type { RequestHandler, Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabasePosCatalogRead, SupabaseStockDemoRepository } from "./adapters/out/supabase-stock-demo.adapters.js";
import { SupabaseStockDemoProvisioning, SupabaseStockDemoSeeder } from "./adapters/out/supabase-stock-demo-seeder.js";
import { CreateStockDemoUseCase, ResetStockDemoUseCase } from "./application/use-cases/stock-demo-seed.use-cases.js";
import type { OrganizationId } from "../../kernel/organization-id.js";
import { DemoPosSalesUseCase, GetStockDemoStatusUseCase, ResolveStockDemoUseCase } from "./application/use-cases/stock-demo.use-cases.js";
import { StockDemoController } from "./adapters/in/stock-demo.controller.js";
import { stockDemoContext } from "./adapters/in/stock-demo-context.middleware.js";
import type { DemoPosSalesPort } from "./domain/ports/in/stock-demo.ports.js";

export interface StockDemoModule {
  router: Router;
  /** Troca para a organização fictícia nas rotas do Stock com `X-Stock-Demo`. */
  stockDemoContext: RequestHandler;
  /** Vendas do POS fictício; os leitores de vendas do Stock usam-no antes da Vendus. */
  demoPosSales: DemoPosSalesPort;
}

/**
 * Composition root da demonstração do Stock (independente da do RH). `runForecast` liga ao módulo
 * stock-planning (previsão e recomendações da organização fictícia depois de semear); é chamado só depois de o
 * servidor estar montado, por isso pode apontar para um módulo construído a seguir a este.
 */
export function createStockDemoModule(deps: { runForecast: (org: OrganizationId) => Promise<void> }): StockDemoModule {
  const repo = new SupabaseStockDemoRepository(createScopedQuery);
  const catalog = new SupabasePosCatalogRead(createScopedQuery);
  const resolve = new ResolveStockDemoUseCase(repo);
  const demoPosSales = new DemoPosSalesUseCase(repo, catalog);
  const seeder = new SupabaseStockDemoSeeder(createScopedQuery);
  const forecast = { run: deps.runForecast };
  const controller = new StockDemoController(
    new GetStockDemoStatusUseCase(repo),
    demoPosSales,
    new CreateStockDemoUseCase(repo, new SupabaseStockDemoProvisioning(createScopedQuery), seeder, forecast, (org) => resolve.forget(org)),
    new ResetStockDemoUseCase(repo, seeder, forecast),
  );
  return {
    router: controller.router,
    stockDemoContext: stockDemoContext((org, scenario) => resolve.execute(org, scenario)),
    demoPosSales,
  };
}
