import type { IngredientCost } from "../../domain/entities/recipe-costing.js";
import type { GetStockItemCostsPort } from "../../domain/ports/in/get-stock-item-costs.port.js";
import type { RecipeCostingReadPort } from "../../domain/ports/out/recipe-costing-read.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

export class GetStockItemCostsUseCase implements GetStockItemCostsPort {
  constructor(private readonly reader: RecipeCostingReadPort) {}

  execute({ organizationId }: { organizationId: OrganizationId }): Promise<IngredientCost[]> {
    return this.reader.loadAllItemCosts(organizationId);
  }
}
