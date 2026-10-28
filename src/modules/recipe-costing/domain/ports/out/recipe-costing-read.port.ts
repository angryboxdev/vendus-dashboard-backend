import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { IngredientCost, RecipeCostingSnapshot } from "../../entities/recipe-costing.js";

/**
 * Lê pratos (pizzas + PVP + receita ativa), preparos e o custo atual de cada
 * ingrediente usado. O custo segue a regra do catálogo de stock: última compra
 * importada com custo; sem compra, o custo de referência manual.
 */
export interface RecipeCostingReadPort {
  loadSnapshot(organizationId: OrganizationId): Promise<RecipeCostingSnapshot>;
  /** Custo atual de todos os artigos de stock (mesma regra: fatura, senão manual). */
  loadAllItemCosts(organizationId: OrganizationId): Promise<IngredientCost[]>;
}
