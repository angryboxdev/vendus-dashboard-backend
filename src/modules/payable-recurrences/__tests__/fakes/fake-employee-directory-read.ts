import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { EmployeeDirectoryReadPort, RecurrenceEmployee } from "../../domain/ports/out/employee-directory-read.port.js";

export class FakeEmployeeDirectoryRead implements EmployeeDirectoryReadPort {
  private readonly store = new Map<string, RecurrenceEmployee[]>();

  add(organizationId: OrganizationId, employee: RecurrenceEmployee): void {
    this.store.set(organizationId, [...(this.store.get(organizationId) ?? []), employee]);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<RecurrenceEmployee | null> {
    return (this.store.get(organizationId) ?? []).find((e) => e.id === id) ?? null;
  }

  async findAll(organizationId: OrganizationId): Promise<RecurrenceEmployee[]> {
    return [...(this.store.get(organizationId) ?? [])].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }
}
