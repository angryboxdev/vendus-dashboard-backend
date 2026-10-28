import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseRecipeCostingReadAdapter } from "./adapters/out/supabase-recipe-costing-read.adapter.js";
import { GetRecipeCostingUseCase } from "./application/use-cases/get-recipe-costing.use-case.js";
import { RecipeCostingController } from "./adapters/in/recipe-costing.controller.js";
import { SupabasePurchaseObservationReadAdapter } from "./adapters/out/supabase-purchase-observation-read.adapter.js";
import { GetIngredientPriceHistoryUseCase } from "./application/use-cases/get-ingredient-price-history.use-case.js";
import { SupabaseDishWeeklyCostReadAdapter } from "./adapters/out/supabase-dish-weekly-cost-read.adapter.js";
import { GetDishWeeklyCostUseCase } from "./application/use-cases/get-dish-weekly-cost.use-case.js";
import { GetDishesImpactUseCase, GetIngredientUsageUseCase, GetIngredientsCostOverviewUseCase } from "./application/use-cases/ingredient-insights.use-cases.js";
import { SupabaseMenuCostingSettingsRepository } from "./adapters/out/supabase-menu-costing-settings.repository.js";
import { GetMenuCostingSettingsUseCase, SaveMenuCostingSettingsUseCase } from "./application/use-cases/menu-costing-settings.use-cases.js";
import { GetStockItemCostsUseCase } from "./application/use-cases/get-stock-item-costs.use-case.js";
import type { GetRecipeCostingPort } from "./domain/ports/in/get-recipe-costing.port.js";
import type { GetStockItemCostsPort } from "./domain/ports/in/get-stock-item-costs.port.js";

export interface RecipeCostingModule {
  router: Router;
  /** Para outros módulos (ex.: `delivery-platforms`, custo real da comida do delivery). */
  getRecipeCosting: GetRecipeCostingPort;
  getStockItemCosts: GetStockItemCostsPort;
}

/**
 * Composition root do módulo `recipe-costing` (custo das fichas técnicas).
 * Só leitura: lê as tabelas legacy de pizzas/receitas/preparos/stock pelos
 * seus próprios adapters, nunca via serviços legacy.
 */
export function createRecipeCostingModule(): RecipeCostingModule {
  const purchases = new SupabasePurchaseObservationReadAdapter(createScopedQuery);
  const snapshots = new SupabaseRecipeCostingReadAdapter(createScopedQuery);
  const dishes = new SupabaseDishWeeklyCostReadAdapter(createScopedQuery);
  const settings = new SupabaseMenuCostingSettingsRepository(createScopedQuery);
  const getRecipeCosting = new GetRecipeCostingUseCase(snapshots, settings);
  const controller = new RecipeCostingController(
    getRecipeCosting,
    new GetIngredientPriceHistoryUseCase(purchases),
    new GetDishWeeklyCostUseCase(dishes, purchases),
    new GetIngredientsCostOverviewUseCase(purchases),
    new GetIngredientUsageUseCase(snapshots, purchases),
    new GetDishesImpactUseCase(dishes, purchases),
    new GetMenuCostingSettingsUseCase(settings),
    new SaveMenuCostingSettingsUseCase(settings),
  );
  return { router: controller.router, getRecipeCosting, getStockItemCosts: new GetStockItemCostsUseCase(snapshots) };
}
