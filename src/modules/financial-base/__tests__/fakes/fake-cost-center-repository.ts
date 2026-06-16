import type { CostCenter } from "../../domain/entities/cost-center.js";
import type {
  CostCenterFilter,
  CostCenterRepositoryPort,
} from "../../domain/ports/out/cost-center-repository.port.js";

export class FakeCostCenterRepository implements CostCenterRepositoryPort {
  private readonly store = new Map<string, CostCenter>();

  async save(costCenter: CostCenter): Promise<void> {
    this.store.set(costCenter.id, costCenter);
  }

  async findById(id: string): Promise<CostCenter | null> {
    return this.store.get(id) ?? null;
  }

  async findByCode(code: string): Promise<CostCenter | null> {
    for (const cc of this.store.values()) {
      if (cc.code === code.trim().toUpperCase()) return cc;
    }
    return null;
  }

  async findAll(filter?: CostCenterFilter): Promise<CostCenter[]> {
    let results = Array.from(this.store.values());
    if (filter?.category) results = results.filter((cc) => cc.category === filter.category);
    if (filter?.status) results = results.filter((cc) => cc.status === filter.status);
    return results;
  }

  async update(costCenter: CostCenter): Promise<void> {
    this.store.set(costCenter.id, costCenter);
  }
}
