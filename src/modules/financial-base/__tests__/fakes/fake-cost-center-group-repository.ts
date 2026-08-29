import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CostCenterGroup } from "../../domain/entities/cost-center-group.js";
import type {
  CostCenterGroupFilter,
  CostCenterGroupRepositoryPort,
} from "../../domain/ports/out/cost-center-group-repository.port.js";

/**
 * A organização é apenas mais um parâmetro (D2) — este fake modela uma única
 * organização de cada vez, tal como as suítes que o usam; a filtragem por
 * organização é responsabilidade do helper (`ScopedQuery`), coberta pelos
 * seus próprios testes, não deste fake.
 */
export class FakeCostCenterGroupRepository implements CostCenterGroupRepositoryPort {
  private store = new Map<string, CostCenterGroup>();

  async save(_organizationId: OrganizationId, group: CostCenterGroup): Promise<void> {
    this.store.set(group.id, group);
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<CostCenterGroup | null> {
    return this.store.get(id) ?? null;
  }

  async findByCode(_organizationId: OrganizationId, code: string): Promise<CostCenterGroup | null> {
    const upper = code.trim().toUpperCase();
    for (const g of this.store.values()) {
      if (g.code === upper) return g;
    }
    return null;
  }

  async findAll(
    _organizationId: OrganizationId,
    filter?: CostCenterGroupFilter,
  ): Promise<CostCenterGroup[]> {
    let results = [...this.store.values()];
    if (filter?.isActive !== undefined) {
      results = results.filter((g) => g.isActive === filter.isActive);
    }
    return results.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async update(_organizationId: OrganizationId, group: CostCenterGroup): Promise<void> {
    this.store.set(group.id, group);
  }

  // Test helpers
  getAll(): CostCenterGroup[] {
    return [...this.store.values()];
  }
}
