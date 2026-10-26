import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { IngredientCostOverview } from "../../services/ingredient-overview.service.js";
import type { IngredientUsage } from "../../services/ingredient-usage.service.js";
import type { DishSizeImpact } from "../../services/dish-impact.service.js";

/** Resumo de custos de todos os ingredientes com compras confirmadas (lista «Artigos e ingredientes», V6). */
export interface IngredientsCostOverviewDTO {
  /** Como se calcula a referência comparativa (mostrado na interface). */
  referenceMethod: string;
  weeks: string[];
  items: IngredientCostOverview[];
}

export interface GetIngredientsCostOverviewPort {
  execute(command: { organizationId: OrganizationId; weeks?: number }): Promise<IngredientsCostOverviewDTO>;
}

/** Fichas técnicas que usam o ingrediente; `null` = artigo inexistente nesta empresa. */
export interface GetIngredientUsagePort {
  execute(command: { organizationId: OrganizationId; stockItemId: string }): Promise<IngredientUsage[] | null>;
}

export interface DishesImpactDTO {
  method: string;
  now: { week: string; weekStart: string };
  then: { week: string; weekStart: string };
  dishes: { pizzaId: string; name: string; category: string; isActive: boolean; versionFrom: string; sizes: DishSizeImpact[] }[];
}

/** Impacto do preço dos ingredientes no custo teórico das pizzas, face a há `compareWeeks` semanas. */
export interface GetDishesImpactPort {
  execute(command: { organizationId: OrganizationId; compareWeeks?: number }): Promise<DishesImpactDTO>;
}
