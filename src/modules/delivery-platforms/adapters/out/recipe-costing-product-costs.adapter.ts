import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { GetRecipeCostingPort } from "../../../recipe-costing/domain/ports/in/get-recipe-costing.port.js";
import type { GetStockItemCostsPort } from "../../../recipe-costing/domain/ports/in/get-stock-item-costs.port.js";
import type { DishCostOption, ItemCostOption } from "../../domain/entities/food-cost.js";
import type { ProductCostsReadPort } from "../../domain/ports/out/product-costs.port.js";

const cents = (eur: number) => Math.round(eur * 100);

/** Bridges as portas do módulo `recipe-costing` (D10): custo das fichas por tamanho e dos artigos. Euros → cêntimos só aqui. */
export class RecipeCostingProductCostsAdapter implements ProductCostsReadPort {
  constructor(
    private readonly getRecipeCosting: GetRecipeCostingPort,
    private readonly getStockItemCosts: GetStockItemCostsPort,
  ) {}

  async dishCosts(organizationId: OrganizationId): Promise<DishCostOption[]> {
    const report = await this.getRecipeCosting.execute({ organizationId });
    return report.dishes
      .filter((d) => d.hasActiveRecipe)
      .map((d) => ({
        pizzaId: d.pizzaId,
        name: d.name,
        sizes: d.sizes.map((s) => ({ size: s.size, costCents: cents(s.costWithoutVat), complete: s.complete })),
      }));
  }

  async itemCosts(organizationId: OrganizationId): Promise<ItemCostOption[]> {
    const costs = await this.getStockItemCosts.execute({ organizationId });
    return costs.map((c) => ({
      stockItemId: c.stockItemId,
      name: c.name,
      baseUnit: c.baseUnit,
      unitCostCents: c.unitCostWithoutVat === null || c.unitCostWithoutVat <= 0 ? null : cents(c.unitCostWithoutVat),
    }));
  }
}
