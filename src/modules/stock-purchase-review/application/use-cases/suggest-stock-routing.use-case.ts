import type { StockReviewPolicy } from "../../../financial-base/domain/entities/cost-center-category.js";
import type { SuggestStockRoutingCommand, SuggestStockRoutingPort } from "../../domain/ports/in/suggest-stock-routing.port.js";
import type { CostCenterCategoryReadPort } from "../../domain/ports/out/cost-center-category-read.port.js";
import type { SupplierReadPort } from "../../domain/ports/out/supplier-read.port.js";
import { suggestStockRouting, type StockRoutingSuggestion } from "../../domain/services/stock-routing-suggestion.service.js";

export class SuggestStockRoutingUseCase implements SuggestStockRoutingPort {
  constructor(
    private readonly categoryRead: CostCenterCategoryReadPort,
    private readonly supplierRead: SupplierReadPort,
  ) {}

  async execute(c: SuggestStockRoutingCommand): Promise<StockRoutingSuggestion> {
    const categoryIds = [...new Set(c.categoryIds.filter(Boolean))];
    const [supplierPolicy, locationPolicy, categoryPolicies] = await Promise.all([
      c.supplierId ? this.supplierRead.getDefaultStockPolicy(c.organizationId, c.supplierId) : Promise.resolve(null),
      c.supplierId && c.locationId ? this.supplierRead.getLocationStockPolicy(c.organizationId, c.supplierId, c.locationId) : Promise.resolve(null),
      Promise.all(categoryIds.map((id) => this.categoryRead.getStockReviewPolicy(c.organizationId, id))),
    ]);
    return suggestStockRouting({
      supplierPolicy,
      locationPolicy,
      categoryPolicies: categoryPolicies.map((p): StockReviewPolicy => p ?? "UNDEFINED"),
    });
  }
}
