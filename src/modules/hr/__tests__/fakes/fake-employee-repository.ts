import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Employee } from "../../domain/entities/employee.js";
import type { EmployeeFilter, EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";

export class FakeEmployeeRepository implements EmployeeRepositoryPort {
  private readonly byOrg = new Map<string, Map<string, Employee>>();

  private store(organizationId: OrganizationId): Map<string, Employee> {
    const key = String(organizationId);
    if (!this.byOrg.has(key)) this.byOrg.set(key, new Map());
    return this.byOrg.get(key)!;
  }

  seed(organizationId: OrganizationId, employee: Employee): void {
    this.store(organizationId).set(employee.id, employee);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<Employee | null> {
    return this.store(organizationId).get(id) ?? null;
  }

  async findMany(organizationId: OrganizationId, filter: EmployeeFilter): Promise<Employee[]> {
    let items = [...this.store(organizationId).values()];
    if (filter.status && filter.status !== "all") items = items.filter((e) => e.status === filter.status);
    if (filter.employmentType) items = items.filter((e) => e.employmentType === filter.employmentType);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      items = items.filter((e) => e.fullName.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q));
    }
    return items.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async create(organizationId: OrganizationId, employee: Employee): Promise<Employee> {
    this.store(organizationId).set(employee.id, employee);
    return employee;
  }

  async update(organizationId: OrganizationId, employee: Employee): Promise<Employee> {
    this.store(organizationId).set(employee.id, employee);
    return employee;
  }
}
