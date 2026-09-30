import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { StockReviewPolicy } from "../../../../financial-base/domain/entities/cost-center-category.js";

/** D10 — wrapper fino sobre `financial-base`'s `ListCostCenterCategoriesPort`, só projeta `stockReviewPolicy`. */
export interface CostCenterCategoryReadPort {
  getStockReviewPolicy(organizationId: OrganizationId, categoryId: string): Promise<StockReviewPolicy | null>;
}
