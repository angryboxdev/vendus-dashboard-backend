import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CostCenterCategory } from "../../domain/entities/cost-center-category.js";
import type {
  CostCenterCategoryFilter,
  CostCenterCategoryRepositoryPort,
} from "../../domain/ports/out/cost-center-category-repository.port.js";

/**
 * A organização é apenas mais um parâmetro (D2) — este fake modela uma única
 * organização de cada vez, tal como as suítes que o usam; a filtragem por
 * organização é responsabilidade do helper (`ScopedQuery`), coberta pelos
 * seus próprios testes, não deste fake.
 */
export class FakeCostCenterCategoryRepository implements CostCenterCategoryRepositoryPort {
  private store = new Map<string, CostCenterCategory>();

  async save(_organizationId: OrganizationId, category: CostCenterCategory): Promise<void> {
    this.store.set(category.id, category);
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<CostCenterCategory | null> {
    return this.store.get(id) ?? null;
  }

  async findByCode(_organizationId: OrganizationId, code: string): Promise<CostCenterCategory | null> {
    const upper = code.trim().toUpperCase();
    for (const c of this.store.values()) {
      if (c.code === upper) return c;
    }
    return null;
  }

  async findByGroupId(_organizationId: OrganizationId, groupId: string): Promise<CostCenterCategory[]> {
    return [...this.store.values()]
      .filter((c) => c.groupId === groupId)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  async findAll(
    _organizationId: OrganizationId,
    filter?: CostCenterCategoryFilter,
  ): Promise<CostCenterCategory[]> {
    let results = [...this.store.values()];
    if (filter?.groupId) results = results.filter((c) => c.groupId === filter.groupId);
    if (filter?.isActive !== undefined) {
      results = results.filter((c) => c.isActive === filter.isActive);
    }
    return results.sort((a, b) => a.code.localeCompare(b.code));
  }

  async update(_organizationId: OrganizationId, category: CostCenterCategory): Promise<void> {
    this.store.set(category.id, category);
  }

  // Test helpers
  getAll(): CostCenterCategory[] {
    return [...this.store.values()];
  }
}
