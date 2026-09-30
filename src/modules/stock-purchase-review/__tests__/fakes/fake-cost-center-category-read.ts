import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { StockReviewPolicy } from "../../../financial-base/domain/entities/cost-center-category.js";
import type { CostCenterCategoryReadPort } from "../../domain/ports/out/cost-center-category-read.port.js";

export class FakeCostCenterCategoryRead implements CostCenterCategoryReadPort {
  policies = new Map<string, StockReviewPolicy>();

  async getStockReviewPolicy(_organizationId: OrganizationId, categoryId: string): Promise<StockReviewPolicy | null> {
    return this.policies.get(categoryId) ?? null;
  }
}
