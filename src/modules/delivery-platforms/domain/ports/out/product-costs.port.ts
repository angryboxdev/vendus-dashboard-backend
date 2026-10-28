import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DishCostOption, ItemCostOption } from "../../entities/food-cost.js";

/** Custos atuais (sem IVA) das fichas técnicas e dos artigos de stock (módulo `recipe-costing`). */
export interface ProductCostsReadPort {
  dishCosts(organizationId: OrganizationId): Promise<DishCostOption[]>;
  itemCosts(organizationId: OrganizationId): Promise<ItemCostOption[]>;
}
