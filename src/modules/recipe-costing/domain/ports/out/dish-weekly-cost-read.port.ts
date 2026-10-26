import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PreparationVersion, RecipeVersion } from "../../entities/weekly-dish-cost.js";

/** Versões gravadas das fichas técnicas (`recipe_versions`) e dados dos ingredientes. */
export interface DishWeeklyCostReadPort {
  findPizza(organizationId: OrganizationId, pizzaId: string): Promise<{ id: string; name: string } | null>;
  listPizzaVersions(organizationId: OrganizationId, pizzaId: string): Promise<RecipeVersion[]>;
  listPreparationVersions(organizationId: OrganizationId, preparationIds: string[]): Promise<Map<string, PreparationVersion[]>>;
  /** Nome, unidade base e custo manual (cêntimos por unidade base) dos artigos. */
  listIngredients(organizationId: OrganizationId, stockItemIds: string[]): Promise<Map<string, { name: string; baseUnit: string; manualCentsPerUnit: number | null }>>;
}
