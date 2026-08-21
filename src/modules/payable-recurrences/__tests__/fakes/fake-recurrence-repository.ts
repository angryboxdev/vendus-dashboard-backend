import type { Recurrence } from "../../domain/entities/recurrence.js";
import type { RecurrenceRepositoryPort, RecurrenceFilter } from "../../domain/ports/out/recurrence-repository.port.js";

export class FakeRecurrenceRepository implements RecurrenceRepositoryPort {
  private readonly store = new Map<string, Recurrence>();

  async save(recurrence: Recurrence): Promise<void> {
    this.store.set(recurrence.id, recurrence);
  }

  async update(recurrence: Recurrence): Promise<void> {
    this.store.set(recurrence.id, recurrence);
  }

  async findById(id: string): Promise<Recurrence | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(filter?: RecurrenceFilter): Promise<Recurrence[]> {
    let items = Array.from(this.store.values());
    if (filter?.status) items = items.filter((r) => r.status === filter.status);
    if (filter?.type) items = items.filter((r) => r.type === filter.type);
    if (filter?.supplierId) items = items.filter((r) => r.supplierId === filter.supplierId);
    return items;
  }
}
