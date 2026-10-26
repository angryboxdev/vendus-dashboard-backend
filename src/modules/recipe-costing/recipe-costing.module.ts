import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseRecipeCostingReadAdapter } from "./adapters/out/supabase-recipe-costing-read.adapter.js";
import { GetRecipeCostingUseCase } from "./application/use-cases/get-recipe-costing.use-case.js";
import { RecipeCostingController } from "./adapters/in/recipe-costing.controller.js";
import { SupabasePurchaseObservationReadAdapter } from "./adapters/out/supabase-purchase-observation-read.adapter.js";
import { GetIngredientPriceHistoryUseCase } from "./application/use-cases/get-ingredient-price-history.use-case.js";
import { SupabaseDishWeeklyCostReadAdapter } from "./adapters/out/supabase-dish-weekly-cost-read.adapter.js";
import { GetDishWeeklyCostUseCase } from "./application/use-cases/get-dish-weekly-cost.use-case.js";

export interface RecipeCostingModule {
  router: Router;
}

/**
 * Composition root do módulo `recipe-costing` (custo das fichas técnicas).
 * Só leitura: lê as tabelas legacy de pizzas/receitas/preparos/stock pelos
 * seus próprios adapters, nunca via serviços legacy.
 */
export function createRecipeCostingModule(): RecipeCostingModule {
  const purchases = new SupabasePurchaseObservationReadAdapter(createScopedQuery);
  const controller = new RecipeCostingController(
    new GetRecipeCostingUseCase(new SupabaseRecipeCostingReadAdapter(createScopedQuery)),
    new GetIngredientPriceHistoryUseCase(purchases),
    new GetDishWeeklyCostUseCase(new SupabaseDishWeeklyCostReadAdapter(createScopedQuery), purchases),
  );
  return { router: controller.router };
}
