import type { RecurrenceOccurrence } from "../../domain/entities/recurrence-occurrence.js";
import type { OccurrenceRepositoryPort, OccurrenceFilter } from "../../domain/ports/out/occurrence-repository.port.js";

export class FakeOccurrenceRepository implements OccurrenceRepositoryPort {
  private readonly store = new Map<string, RecurrenceOccurrence>();

  async save(occurrence: RecurrenceOccurrence): Promise<void> {
    this.store.set(occurrence.id, occurrence);
  }

  async update(occurrence: RecurrenceOccurrence): Promise<void> {
    this.store.set(occurrence.id, occurrence);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async findById(id: string): Promise<RecurrenceOccurrence | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(filter?: OccurrenceFilter): Promise<RecurrenceOccurrence[]> {
    let items = Array.from(this.store.values());
    if (filter?.recurrenceId) items = items.filter((o) => o.recurrenceId === filter.recurrenceId);
    if (filter?.period) items = items.filter((o) => o.period === filter.period);
    if (filter?.status) items = items.filter((o) => o.status === filter.status);
    if (filter?.invoiceId) items = items.filter((o) => o.invoiceId === filter.invoiceId);
    return items;
  }

  async findByRecurrenceAndPeriod(recurrenceId: string, period: string): Promise<RecurrenceOccurrence | null> {
    return Array.from(this.store.values()).find(
      (o) => o.recurrenceId === recurrenceId && o.period === period,
    ) ?? null;
  }

  async findLinkedInvoiceIds(): Promise<string[]> {
    return Array.from(this.store.values())
      .filter((o) => o.invoiceId !== null)
      .map((o) => o.invoiceId!);
  }

  async countByStatus(): Promise<Partial<Record<import("../../domain/entities/recurrence-occurrence.js").OccurrenceStatus, number>>> {
    const counts: Partial<Record<string, number>> = {};
    for (const o of this.store.values()) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
    }
    return counts;
  }
}
