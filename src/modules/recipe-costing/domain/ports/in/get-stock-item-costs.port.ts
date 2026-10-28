import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { IngredientCost } from "../../entities/recipe-costing.js";

/**
 * Custo atual (sem IVA) de todos os artigos de stock — última compra, senão o custo manual. Exposto a
 * outros módulos (ex.: `delivery-platforms`, custo das bebidas e da embalagem).
 */
export interface GetStockItemCostsPort {
  execute(command: { organizationId: OrganizationId }): Promise<IngredientCost[]>;
}
