import type { Supplier } from "../../domain/entities/supplier.js";
import type {
  SupplierFilter,
  SupplierRepositoryPort,
} from "../../domain/ports/out/supplier-repository.port.js";

export class FakeSupplierRepository implements SupplierRepositoryPort {
  private readonly store = new Map<string, Supplier>();

  async save(supplier: Supplier): Promise<void> {
    this.store.set(supplier.id, supplier);
  }

  async findById(id: string): Promise<Supplier | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(filter?: SupplierFilter): Promise<Supplier[]> {
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

  async update(supplier: Supplier): Promise<void> {
    this.store.set(supplier.id, supplier);
  }
}
