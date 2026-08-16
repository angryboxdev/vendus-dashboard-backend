import type { CategorySnapshot } from "../../domain/entities/invoice-line.js";
import type { CategoryLookup, CostCenterCategoryReaderPort } from "../../domain/ports/out/cost-center-category-reader.port.js";

export class FakeCostCenterCategoryReader implements CostCenterCategoryReaderPort {
  private store = new Map<string, CategorySnapshot>();
  private lookupStore = new Map<string, CategoryLookup>();

  seed(snapshot: CategorySnapshot): void {
    this.store.set(snapshot.id, snapshot);
  }

  seedLookup(lookup: CategoryLookup): void {
    this.lookupStore.set(lookup.id, lookup);
  }

  async findById(id: string): Promise<CategorySnapshot | null> {
    return this.store.get(id) ?? null;
  }

  async findManyByIds(ids: string[]): Promise<CategoryLookup[]> {
    return ids.flatMap((id) => {
      const entry = this.lookupStore.get(id);
      return entry ? [entry] : [];
    });
  }
}
