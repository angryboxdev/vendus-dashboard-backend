import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { BaseScheduleTemplate } from "../../domain/entities/base-schedule-template.js";
import type { BaseScheduleRepositoryPort } from "../../domain/ports/out/base-schedule-repository.port.js";

export class FakeBaseScheduleRepository implements BaseScheduleRepositoryPort {
  private readonly byOrg = new Map<string, Map<string, BaseScheduleTemplate>>();

  private store(organizationId: OrganizationId): Map<string, BaseScheduleTemplate> {
    const key = String(organizationId);
    if (!this.byOrg.has(key)) this.byOrg.set(key, new Map());
    return this.byOrg.get(key)!;
  }

  seed(organizationId: OrganizationId, template: BaseScheduleTemplate): void {
    this.store(organizationId).set(`${template.employeeId}:${template.weekday}`, template);
  }

  async findByEmployee(organizationId: OrganizationId, employeeId: string): Promise<BaseScheduleTemplate[]> {
    return [...this.store(organizationId).values()].filter((t) => t.employeeId === employeeId);
  }

  async findAll(organizationId: OrganizationId): Promise<BaseScheduleTemplate[]> {
    return [...this.store(organizationId).values()];
  }

  async upsert(organizationId: OrganizationId, template: BaseScheduleTemplate): Promise<BaseScheduleTemplate> {
    this.store(organizationId).set(`${template.employeeId}:${template.weekday}`, template);
    return template;
  }
}
