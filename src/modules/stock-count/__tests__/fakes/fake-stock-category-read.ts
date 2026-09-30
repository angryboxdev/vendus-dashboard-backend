import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { StockCategoryReadPort, StockCategorySnapshot } from "../../domain/ports/out/stock-category-read.port.js";

export class FakeStockCategoryRead implements StockCategoryReadPort {
  categories = new Map<string, StockCategorySnapshot>();

  seed(category: StockCategorySnapshot): void {
    this.categories.set(category.id, category);
  }

  async findById(_organizationId: OrganizationId, categoryId: string): Promise<StockCategorySnapshot | null> {
    return this.categories.get(categoryId) ?? null;
  }

  async listAll(_organizationId: OrganizationId): Promise<StockCategorySnapshot[]> {
    return [...this.categories.values()];
  }
}
