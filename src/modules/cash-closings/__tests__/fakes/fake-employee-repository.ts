import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Employee, EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

export class FakeEmployeeRepository implements EmployeeRepositoryPort {
  private readonly byPinHash = new Map<string, Employee>();
  private readonly byId = new Map<string, Employee>();

  addEmployee(organizationId: OrganizationId, employee: Employee, pinHash?: string): void {
    this.byId.set(key(organizationId, employee.id), employee);
    if (pinHash) this.byPinHash.set(key(organizationId, pinHash), employee);
  }

  async findActiveByPinHash(organizationId: OrganizationId, pinHash: string): Promise<Employee | null> {
    return this.byPinHash.get(key(organizationId, pinHash)) ?? null;
  }

  async findActiveById(organizationId: OrganizationId, id: string): Promise<Employee | null> {
    return this.byId.get(key(organizationId, id)) ?? null;
  }
}
