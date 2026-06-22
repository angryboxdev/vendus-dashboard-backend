import type { CostCenterGroup } from "../../domain/entities/cost-center-group.js";
import type {
  CostCenterGroupFilter,
  CostCenterGroupRepositoryPort,
} from "../../domain/ports/out/cost-center-group-repository.port.js";

export class FakeCostCenterGroupRepository implements CostCenterGroupRepositoryPort {
  private store = new Map<string, CostCenterGroup>();

  async save(group: CostCenterGroup): Promise<void> {
    this.store.set(group.id, group);
  }

  async findById(id: string): Promise<CostCenterGroup | null> {
    return this.store.get(id) ?? null;
  }

  async findByCode(code: string): Promise<CostCenterGroup | null> {
    const upper = code.trim().toUpperCase();
    for (const g of this.store.values()) {
      if (g.code === upper) return g;
    }
    return null;
  }

  async findAll(filter?: CostCenterGroupFilter): Promise<CostCenterGroup[]> {
    let results = [...this.store.values()];
    if (filter?.isActive !== undefined) {
      results = results.filter((g) => g.isActive === filter.isActive);
    }
    return results.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async update(group: CostCenterGroup): Promise<void> {
    this.store.set(group.id, group);
  }

  // Test helpers
  getAll(): CostCenterGroup[] {
    return [...this.store.values()];
  }
}
