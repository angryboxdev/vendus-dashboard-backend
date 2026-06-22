import type { CostCenterCategory } from "../../domain/entities/cost-center-category.js";
import type {
  CostCenterCategoryFilter,
  CostCenterCategoryRepositoryPort,
} from "../../domain/ports/out/cost-center-category-repository.port.js";

export class FakeCostCenterCategoryRepository implements CostCenterCategoryRepositoryPort {
  private store = new Map<string, CostCenterCategory>();

  async save(category: CostCenterCategory): Promise<void> {
    this.store.set(category.id, category);
  }

  async findById(id: string): Promise<CostCenterCategory | null> {
    return this.store.get(id) ?? null;
  }

  async findByCode(code: string): Promise<CostCenterCategory | null> {
    const upper = code.trim().toUpperCase();
    for (const c of this.store.values()) {
      if (c.code === upper) return c;
    }
    return null;
  }

  async findByGroupId(groupId: string): Promise<CostCenterCategory[]> {
    return [...this.store.values()]
      .filter((c) => c.groupId === groupId)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  async findAll(filter?: CostCenterCategoryFilter): Promise<CostCenterCategory[]> {
    let results = [...this.store.values()];
    if (filter?.groupId) results = results.filter((c) => c.groupId === filter.groupId);
    if (filter?.isActive !== undefined) {
      results = results.filter((c) => c.isActive === filter.isActive);
    }
    return results.sort((a, b) => a.code.localeCompare(b.code));
  }

  async update(category: CostCenterCategory): Promise<void> {
    this.store.set(category.id, category);
  }

  // Test helpers
  getAll(): CostCenterCategory[] {
    return [...this.store.values()];
  }
}
