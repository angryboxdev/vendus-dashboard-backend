import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Supplier } from "../../domain/entities/supplier.js";
import type {
  SupplierFilter,
  SupplierRepositoryPort,
} from "../../domain/ports/out/supplier-repository.port.js";

/**
 * A organização é apenas mais um parâmetro (D2) — este fake modela uma única
 * organização de cada vez, tal como as suítes que o usam; a filtragem por
 * organização é responsabilidade do helper (`ScopedQuery`), coberta pelos
 * seus próprios testes, não deste fake.
 */
export class FakeSupplierRepository implements SupplierRepositoryPort {
  private readonly store = new Map<string, Supplier>();

  async save(_organizationId: OrganizationId, supplier: Supplier): Promise<void> {
    this.store.set(supplier.id, supplier);
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<Supplier | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(_organizationId: OrganizationId, filter?: SupplierFilter): Promise<Supplier[]> {
    let results = Array.from(this.store.values());
    if (filter?.status) results = results.filter((s) => s.status === filter.status);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.nif ?? "").toLowerCase().includes(q),
      );
    }
    return results;
  }

  async update(_organizationId: OrganizationId, supplier: Supplier): Promise<void> {
    this.store.set(supplier.id, supplier);
  }
}
