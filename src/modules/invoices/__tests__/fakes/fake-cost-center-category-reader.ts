import type { CategorySnapshot } from "../../domain/entities/invoice-line.js";
import type { CostCenterCategoryReaderPort } from "../../domain/ports/out/cost-center-category-reader.port.js";

export class FakeCostCenterCategoryReader implements CostCenterCategoryReaderPort {
  private store = new Map<string, CategorySnapshot>();

  seed(snapshot: CategorySnapshot): void {
    this.store.set(snapshot.id, snapshot);
  }

  async findById(id: string): Promise<CategorySnapshot | null> {
    return this.store.get(id) ?? null;
  }
}
