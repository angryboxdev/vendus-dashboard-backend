import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import type {
  ShiftAttendanceStatusValue,
  WorkShiftFilter,
  WorkShiftRepositoryPort,
} from "../../domain/ports/out/work-shift-repository.port.js";

export class FakeWorkShiftRepository implements WorkShiftRepositoryPort {
  private readonly byOrg = new Map<string, Map<string, WorkShift>>();
  private readonly attendanceByShiftId = new Map<string, ShiftAttendanceStatusValue>();
  private readonly shiftIdsWithAttendance = new Set<string>();

  private store(organizationId: OrganizationId): Map<string, WorkShift> {
    const key = String(organizationId);
    if (!this.byOrg.has(key)) this.byOrg.set(key, new Map());
    return this.byOrg.get(key)!;
  }

  seed(organizationId: OrganizationId, shift: WorkShift): void {
    this.store(organizationId).set(shift.id, shift);
  }

  seedAttendance(shiftId: string, status: ShiftAttendanceStatusValue): void {
    this.attendanceByShiftId.set(shiftId, status);
    this.shiftIdsWithAttendance.add(shiftId);
  }

  async findInRange(organizationId: OrganizationId, filter: WorkShiftFilter): Promise<WorkShift[]> {
    return [...this.store(organizationId).values()].filter((s) => {
      if (s.workDate < filter.from || s.workDate > filter.to) return false;
      if (filter.employeeId && s.employeeId !== filter.employeeId) return false;
      if (filter.locationId && s.locationId !== filter.locationId) return false;
      if (filter.status && s.status !== filter.status) return false;
      return true;
    });
  }

  async findById(organizationId: OrganizationId, id: string): Promise<WorkShift | null> {
    return this.store(organizationId).get(id) ?? null;
  }

  async create(organizationId: OrganizationId, shift: WorkShift): Promise<WorkShift> {
    this.store(organizationId).set(shift.id, shift);
    return shift;
  }

  async update(organizationId: OrganizationId, shift: WorkShift): Promise<WorkShift> {
    this.store(organizationId).set(shift.id, shift);
    return shift;
  }

  async delete(organizationId: OrganizationId, id: string): Promise<void> {
    this.store(organizationId).delete(id);
  }

  async deleteMany(organizationId: OrganizationId, ids: string[]): Promise<void> {
    for (const id of ids) this.store(organizationId).delete(id);
  }

  async hasAttendance(_organizationId: OrganizationId, shiftId: string): Promise<boolean> {
    return this.shiftIdsWithAttendance.has(shiftId);
  }

  async findAttendanceStatusesByShiftIds(
    _organizationId: OrganizationId,
    shiftIds: string[],
  ): Promise<Map<string, ShiftAttendanceStatusValue>> {
    const result = new Map<string, ShiftAttendanceStatusValue>();
    for (const id of shiftIds) {
      const status = this.attendanceByShiftId.get(id);
      if (status) result.set(id, status);
    }
    return result;
  }

  async findBySeriesId(organizationId: OrganizationId, seriesId: string): Promise<WorkShift[]> {
    return [...this.store(organizationId).values()]
      .filter((s) => s.seriesId === seriesId)
      .sort((a, b) => a.workDate.localeCompare(b.workDate));
  }
}
