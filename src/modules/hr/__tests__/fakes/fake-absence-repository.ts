import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Absence } from "../../domain/entities/absence.js";
import type { AbsenceRepositoryPort, LeaveBalanceRecord } from "../../domain/ports/out/absence-repository.port.js";

export class FakeAbsenceRepository implements AbsenceRepositoryPort {
  readonly items = new Map<string, Absence>();
  readonly balances = new Map<string, LeaveBalanceRecord>(); // `${employeeId}:${year}`

  seed(absence: Absence): void {
    this.items.set(absence.id, absence);
  }
  async findInRange(_org: OrganizationId, from: string, to: string): Promise<Absence[]> {
    return [...this.items.values()].filter((a) => a.overlaps(from, to)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
  async findById(_org: OrganizationId, id: string): Promise<Absence | null> {
    return this.items.get(id) ?? null;
  }
  async findActiveForEmployee(_org: OrganizationId, employeeId: string, from: string, to: string): Promise<Absence[]> {
    return [...this.items.values()].filter((a) => a.employeeId === employeeId && a.isActive && a.overlaps(from, to));
  }
  async create(_org: OrganizationId, absence: Absence): Promise<Absence> {
    this.items.set(absence.id, absence);
    return absence;
  }
  async update(_org: OrganizationId, absence: Absence): Promise<Absence> {
    this.items.set(absence.id, absence);
    return absence;
  }
  async findBalance(_org: OrganizationId, employeeId: string, year: number): Promise<LeaveBalanceRecord | null> {
    return this.balances.get(`${employeeId}:${year}`) ?? null;
  }
}
