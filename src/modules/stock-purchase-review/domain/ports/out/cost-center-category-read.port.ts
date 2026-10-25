import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { StockReviewPolicy } from "../../../../financial-base/domain/entities/cost-center-category.js";

/** D10 — wrapper fino sobre `financial-base`'s `ListCostCenterCategoriesPort`, só projeta `stockReviewPolicy`. */
export interface CostCenterCategoryReadPort {
  getStockReviewPolicy(organizationId: OrganizationId, categoryId: string): Promise<StockReviewPolicy | null>;
  /** Uma só leitura do catálogo para várias categorias (conferência de categorias, F3a); ids desconhecidos ficam de fora. */
  getStockReviewPolicies(organizationId: OrganizationId, categoryIds: string[]): Promise<Map<string, StockReviewPolicy>>;
}
