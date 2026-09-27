import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AttendanceSnapshotRow, AttendanceWritePort, UpsertAttendanceInput } from "../../domain/ports/out/attendance-write.port.js";

export class FakeAttendanceWriteAdapter implements AttendanceWritePort {
  private readonly rows = new Map<string, AttendanceSnapshotRow>();

  seed(row: AttendanceSnapshotRow): void {
    this.rows.set(row.id, row);
  }

  async findById(_organizationId: OrganizationId, attendanceId: string): Promise<AttendanceSnapshotRow | null> {
    return this.rows.get(attendanceId) ?? null;
  }

  async upsert(_organizationId: OrganizationId, input: UpsertAttendanceInput): Promise<AttendanceSnapshotRow> {
    const id = input.attendanceId ?? randomUUID();
    const row: AttendanceSnapshotRow = {
      id,
      workShiftId: input.workShiftId,
      employeeId: input.employeeId,
      workDate: input.workDate,
      locationId: input.locationId,
      status: input.status,
      actualStartTime: input.actualStartTime,
      actualEndTime: input.actualEndTime,
      lateMinutes: input.lateMinutes,
      registrationSource: input.registrationSource,
    };
    this.rows.set(id, row);
    return row;
  }
}
