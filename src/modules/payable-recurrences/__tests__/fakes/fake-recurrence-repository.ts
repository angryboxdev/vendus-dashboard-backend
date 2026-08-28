import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Recurrence } from "../../domain/entities/recurrence.js";
import type { RecurrenceRepositoryPort, RecurrenceFilter } from "../../domain/ports/out/recurrence-repository.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

export class FakeRecurrenceRepository implements RecurrenceRepositoryPort {
  private readonly store = new Map<string, Recurrence>();

  async save(organizationId: OrganizationId, recurrence: Recurrence): Promise<void> {
    this.store.set(key(organizationId, recurrence.id), recurrence);
  }

  async update(organizationId: OrganizationId, recurrence: Recurrence): Promise<void> {
    this.store.set(key(organizationId, recurrence.id), recurrence);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<Recurrence | null> {
    return this.store.get(key(organizationId, id)) ?? null;
  }

  async findAll(organizationId: OrganizationId, filter?: RecurrenceFilter): Promise<Recurrence[]> {
    const prefix = `${organizationId}:`;
    let items = [...this.store.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, recurrence]) => recurrence);
    if (filter?.status) items = items.filter((r) => r.status === filter.status);
    if (filter?.type) items = items.filter((r) => r.type === filter.type);
    if (filter?.supplierId) items = items.filter((r) => r.supplierId === filter.supplierId);
    return items;
  }
}
