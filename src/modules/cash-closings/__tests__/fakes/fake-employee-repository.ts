import type { Employee, EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";

export class FakeEmployeeRepository implements EmployeeRepositoryPort {
  private readonly byPinHash = new Map<string, Employee>();
  private readonly byId = new Map<string, Employee>();

  addEmployee(employee: Employee, pinHash?: string): void {
    this.byId.set(employee.id, employee);
    if (pinHash) this.byPinHash.set(pinHash, employee);
  }

  async findActiveByPinHash(pinHash: string): Promise<Employee | null> {
    return this.byPinHash.get(pinHash) ?? null;
  }

  async findActiveById(id: string): Promise<Employee | null> {
    return this.byId.get(id) ?? null;
  }
}
