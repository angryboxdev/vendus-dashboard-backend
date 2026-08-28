import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { RecurrenceOccurrence } from "../../domain/entities/recurrence-occurrence.js";
import type { OccurrenceRepositoryPort, OccurrenceFilter } from "../../domain/ports/out/occurrence-repository.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

export class FakeOccurrenceRepository implements OccurrenceRepositoryPort {
  private readonly store = new Map<string, RecurrenceOccurrence>();

  async save(organizationId: OrganizationId, occurrence: RecurrenceOccurrence): Promise<void> {
    this.store.set(key(organizationId, occurrence.id), occurrence);
  }

  async update(organizationId: OrganizationId, occurrence: RecurrenceOccurrence): Promise<void> {
    this.store.set(key(organizationId, occurrence.id), occurrence);
  }

  async delete(organizationId: OrganizationId, id: string): Promise<void> {
    this.store.delete(key(organizationId, id));
  }

  async findById(organizationId: OrganizationId, id: string): Promise<RecurrenceOccurrence | null> {
    return this.store.get(key(organizationId, id)) ?? null;
  }

  async findAll(organizationId: OrganizationId, filter?: OccurrenceFilter): Promise<RecurrenceOccurrence[]> {
    const prefix = `${organizationId}:`;
    let items = [...this.store.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, occurrence]) => occurrence);
    if (filter?.recurrenceId) items = items.filter((o) => o.recurrenceId === filter.recurrenceId);
    if (filter?.period) items = items.filter((o) => o.period === filter.period);
    if (filter?.status) items = items.filter((o) => o.status === filter.status);
    if (filter?.invoiceId) items = items.filter((o) => o.invoiceId === filter.invoiceId);
    return items;
  }

  async findByRecurrenceAndPeriod(
    organizationId: OrganizationId,
    recurrenceId: string,
    period: string,
  ): Promise<RecurrenceOccurrence | null> {
    const prefix = `${organizationId}:`;
    return (
      [...this.store.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([, occurrence]) => occurrence)
        .find((o) => o.recurrenceId === recurrenceId && o.period === period) ?? null
    );
  }

  async findLinkedInvoiceIds(organizationId: OrganizationId): Promise<string[]> {
    const prefix = `${organizationId}:`;
    return [...this.store.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, occurrence]) => occurrence)
      .filter((o) => o.invoiceId !== null)
      .map((o) => o.invoiceId!);
  }

  async countByStatus(
    organizationId: OrganizationId,
  ): Promise<Partial<Record<import("../../domain/entities/recurrence-occurrence.js").OccurrenceStatus, number>>> {
    const prefix = `${organizationId}:`;
    const counts: Partial<Record<string, number>> = {};
    for (const [k, o] of this.store.entries()) {
      if (!k.startsWith(prefix)) continue;
      counts[o.status] = (counts[o.status] ?? 0) + 1;
    }
    return counts;
  }
}
