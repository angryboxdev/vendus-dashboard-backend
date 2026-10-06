import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PunchEventRecord, PunchRepositoryPort, RecordPunchInput } from "../../domain/ports/out/punch-repository.port.js";
import type { PunchAttendance } from "../../domain/services/punch.service.js";

/** Assiduidade + eventos em memória, com a mesma unicidade da BD (1 linha por turno, chave de idempotência única). */
export class FakePunchRepository implements PunchRepositoryPort {
  readonly attendance: PunchAttendance[] = [];
  readonly events: Array<PunchEventRecord & { idempotencyKey: string; latitude: number | null; accuracyM: number | null }> = [];

  async findAttendanceByShiftIds(_org: OrganizationId, shiftIds: string[]): Promise<PunchAttendance[]> {
    return this.attendance.filter((a) => shiftIds.includes(a.workShiftId)).map((a) => ({ ...a }));
  }

  async findEventByIdempotencyKey(_org: OrganizationId, key: string): Promise<PunchEventRecord | null> {
    return this.events.find((e) => e.idempotencyKey === key) ?? null;
  }

  async recordPunch(_org: OrganizationId, input: RecordPunchInput): Promise<PunchEventRecord> {
    if (this.events.some((e) => e.idempotencyKey === input.idempotencyKey)) throw new Error("duplicate key");
    let attendanceId = input.attendanceId;
    if (input.kind === "in") {
      if (this.attendance.some((a) => a.workShiftId === input.workShiftId)) throw new Error("unique work_shift_id");
      attendanceId = randomUUID();
      this.attendance.push({ id: attendanceId, workShiftId: input.workShiftId, status: input.status, actualStartTime: input.time, actualEndTime: null });
    } else {
      const row = this.attendance.find((a) => a.id === attendanceId)!;
      row.actualEndTime = input.time;
      row.status = input.status;
    }
    const event = {
      id: randomUUID(),
      attendanceId: attendanceId!,
      employeeId: input.employeeId,
      workShiftId: input.workShiftId,
      locationId: input.locationId,
      kind: input.kind,
      serverAt: input.serverAt,
      geofenceStatus: input.geofenceStatus,
      unverifiedReason: input.unverifiedReason,
      distanceM: input.distanceM,
      idempotencyKey: input.idempotencyKey,
      latitude: input.latitude,
      accuracyM: input.accuracyM,
    };
    this.events.push(event);
    return event;
  }
}
