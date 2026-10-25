import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseRecipeCostingReadAdapter } from "./adapters/out/supabase-recipe-costing-read.adapter.js";
import { GetRecipeCostingUseCase } from "./application/use-cases/get-recipe-costing.use-case.js";
import { RecipeCostingController } from "./adapters/in/recipe-costing.controller.js";

export interface RecipeCostingModule {
  router: Router;
}

/**
 * Composition root do módulo `recipe-costing` (custo das fichas técnicas).
 * Só leitura: lê as tabelas legacy de pizzas/receitas/preparos/stock pelos
 * seus próprios adapters, nunca via serviços legacy.
 */
export function createRecipeCostingModule(): RecipeCostingModule {
  const controller = new RecipeCostingController(
    new GetRecipeCostingUseCase(new SupabaseRecipeCostingReadAdapter(createScopedQuery)),
  );
  return { router: controller.router };
}
