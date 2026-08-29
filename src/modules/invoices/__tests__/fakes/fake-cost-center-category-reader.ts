import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CategorySnapshot } from "../../domain/entities/invoice-line.js";
import type { CategoryLookup, CostCenterCategoryReaderPort } from "../../domain/ports/out/cost-center-category-reader.port.js";

/**
 * A organização é apenas mais um parâmetro (D2) — este fake modela uma única
 * organização de cada vez, tal como as suítes que o usam; a filtragem por
 * organização é responsabilidade do helper (`ScopedQuery`), coberta pelos
 * seus próprios testes, não deste fake.
 */
export class FakeCostCenterCategoryReader implements CostCenterCategoryReaderPort {
  private store = new Map<string, CategorySnapshot>();
  private lookupStore = new Map<string, CategoryLookup>();

  seed(snapshot: CategorySnapshot): void {
    this.store.set(snapshot.id, snapshot);
  }

  seedLookup(lookup: CategoryLookup): void {
    this.lookupStore.set(lookup.id, lookup);
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<CategorySnapshot | null> {
    return this.store.get(id) ?? null;
  }

  async findManyByIds(_organizationId: OrganizationId, ids: string[]): Promise<CategoryLookup[]> {
    return ids.flatMap((id) => {
      const entry = this.lookupStore.get(id);
      return entry ? [entry] : [];
    });
  }
}
