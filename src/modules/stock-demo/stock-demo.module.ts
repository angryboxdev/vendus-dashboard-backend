import type { RequestHandler, Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabasePosCatalogRead, SupabaseStockDemoRepository } from "./adapters/out/supabase-stock-demo.adapters.js";
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

/** Composition root da demonstração do Stock (independente da do RH). */
export function createStockDemoModule(): StockDemoModule {
  const repo = new SupabaseStockDemoRepository(createScopedQuery);
  const catalog = new SupabasePosCatalogRead(createScopedQuery);
  const resolve = new ResolveStockDemoUseCase(repo);
  const demoPosSales = new DemoPosSalesUseCase(repo, catalog);
  const controller = new StockDemoController(new GetStockDemoStatusUseCase(repo), demoPosSales);
  return {
    router: controller.router,
    stockDemoContext: stockDemoContext((org, scenario) => resolve.execute(org, scenario)),
    demoPosSales,
  };
}
