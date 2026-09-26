import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ShiftAttendanceReadPort, ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";

export class FakeShiftAttendanceReadAdapter implements ShiftAttendanceReadPort {
  private readonly byOrg = new Map<string, ShiftOccurrence[]>();

  seed(organizationId: OrganizationId, shift: ShiftOccurrence): void {
    const key = String(organizationId);
    const list = this.byOrg.get(key) ?? [];
    list.push(shift);
    this.byOrg.set(key, list);
  }

  async findShiftsInRange(
    organizationId: OrganizationId,
    range: { from: string; to: string; locationId?: string },
  ): Promise<ShiftOccurrence[]> {
    const all = this.byOrg.get(String(organizationId)) ?? [];
    return all.filter(
      (s) =>
        s.workDate >= range.from &&
        s.workDate <= range.to &&
        (!range.locationId || s.locationId === range.locationId),
    );
  }
}
