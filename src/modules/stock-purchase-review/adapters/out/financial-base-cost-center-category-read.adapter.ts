import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ListCostCenterCategoriesPort } from "../../../financial-base/domain/ports/in/cost-center-category.ports.js";
import type { StockReviewPolicy } from "../../../financial-base/domain/entities/cost-center-category.js";
import type { CostCenterCategoryReadPort } from "../../domain/ports/out/cost-center-category-read.port.js";

/** D10 — tradução fina sobre `financial-base`'s `ListCostCenterCategoriesPort`, só projeta `stockReviewPolicy`. */
export class FinancialBaseCostCenterCategoryReadAdapter implements CostCenterCategoryReadPort {
  constructor(private readonly listCostCenterCategories: ListCostCenterCategoriesPort) {}

  async getStockReviewPolicy(organizationId: OrganizationId, categoryId: string): Promise<StockReviewPolicy | null> {
    const categories = await this.listCostCenterCategories.execute({ organizationId });
    const category = categories.find((c) => c.id === categoryId);
    return category ? category.stockReviewPolicy : null;
  }

  async getStockReviewPolicies(organizationId: OrganizationId, categoryIds: string[]): Promise<Map<string, StockReviewPolicy>> {
    if (categoryIds.length === 0) return new Map();
    const wanted = new Set(categoryIds);
    const categories = await this.listCostCenterCategories.execute({ organizationId });
    return new Map(categories.filter((c) => wanted.has(c.id)).map((c) => [c.id, c.stockReviewPolicy]));
  }
}
