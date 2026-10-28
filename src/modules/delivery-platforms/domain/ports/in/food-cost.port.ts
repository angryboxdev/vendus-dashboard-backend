import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { FoodCost, ProductTargetType } from "../../entities/food-cost.js";

/** Custo real da comida e da embalagem do delivery num mês. */
export interface GetFoodCostPort {
  execute(input: { organizationId: OrganizationId; year: number; month: number }): Promise<FoodCost>;
}

/** Uma correção: `targetType: null` apaga o mapeamento (volta à sugestão automática). */
export interface ProductMappingChange {
  productKey: string;
  productCode: string | null;
  productDescription: string;
  targetType: ProductTargetType | null;
  pizzaId?: string | null;
  size?: string | null;
  stockItemId?: string | null;
}

/** Grava as correções dos mapeamentos dos produtos e da embalagem. */
export interface SaveProductMappingsPort {
  execute(input: { organizationId: OrganizationId; changes: ProductMappingChange[]; updatedBy: string | null }): Promise<void>;
}
