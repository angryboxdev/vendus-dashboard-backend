import type { PayableEntry } from "../../domain/entities/payable-entry.js";
import type { PayableEntryFilter, PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";

export class FakePayableEntryRepository implements PayableEntryRepositoryPort {
  private store = new Map<string, PayableEntry>();

  async save(entry: PayableEntry): Promise<void> {
    this.store.set(entry.id, entry);
  }

  async findById(id: string): Promise<PayableEntry | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(filter?: PayableEntryFilter): Promise<PayableEntry[]> {
    let result = [...this.store.values()];
    if (filter?.supplierId) result = result.filter((e) => e.supplierId === filter.supplierId);
    if (filter?.costCenterId) result = result.filter((e) => e.costCenterId === filter.costCenterId);
    if (filter?.status) result = result.filter((e) => e.status === filter.status);
    if (filter?.from) {
      const from = filter.from;
      result = result.filter((e) => e.dueDate >= from);
    }
    if (filter?.to) {
      const to = filter.to;
      result = result.filter((e) => e.dueDate <= to);
    }
    return result.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  async update(entry: PayableEntry): Promise<void> {
    this.store.set(entry.id, entry);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
