import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { formatHrTimeForApi, normalizeTimeForPg } from "../../../../utils/hrTime.js";
import type { PunchEventRecord, PunchRepositoryPort, RecordPunchInput } from "../../domain/ports/out/punch-repository.port.js";
import type { PunchAttendance } from "../../domain/services/punch.service.js";

const EVENT_SELECT = "id, attendance_id, employee_id, work_shift_id, location_id, kind, server_at, geofence_status, unverified_reason, distance_m";

interface EventRow {
  id: string;
  attendance_id: string;
  employee_id: string;
  work_shift_id: string | null;
  location_id: string;
  kind: "in" | "out";
  server_at: string;
  geofence_status: PunchEventRecord["geofenceStatus"];
  unverified_reason: PunchEventRecord["unverifiedReason"];
  distance_m: number | string | null;
}

function toEvent(row: EventRow): PunchEventRecord {
  return {
    id: row.id,
    attendanceId: row.attendance_id,
    employeeId: row.employee_id,
    workShiftId: row.work_shift_id,
    locationId: row.location_id,
    kind: row.kind,
    serverAt: row.server_at,
    geofenceStatus: row.geofence_status,
    unverifiedReason: row.unverified_reason,
    distanceM: row.distance_m === null ? null : Number(row.distance_m),
  };
}

export class SupabasePunchRepository implements PunchRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findAttendanceByShiftIds(organizationId: OrganizationId, shiftIds: string[]): Promise<PunchAttendance[]> {
    if (shiftIds.length === 0) return [];
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_shift_attendance")
      .select("id, work_shift_id, status, actual_start_time, actual_end_time")
      .in("work_shift_id", shiftIds);
    if (error) throw new Error(error.message);
    return (data as unknown as Array<{ id: string; work_shift_id: string; status: string; actual_start_time: string | null; actual_end_time: string | null }>).map((r) => ({
      id: r.id,
      workShiftId: r.work_shift_id,
      status: r.status,
      actualStartTime: r.actual_start_time ? formatHrTimeForApi(r.actual_start_time) : null,
      actualEndTime: r.actual_end_time ? formatHrTimeForApi(r.actual_end_time) : null,
    }));
  }

  async findEventByIdempotencyKey(organizationId: OrganizationId, idempotencyKey: string): Promise<PunchEventRecord | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_attendance_punch_events")
      .select(EVENT_SELECT)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEvent(data as unknown as EventRow) : null;
  }

  async recordPunch(organizationId: OrganizationId, input: RecordPunchInput): Promise<PunchEventRecord> {
    const scoped = this.scopedQuery(organizationId);
    const time = normalizeTimeForPg(input.time);
    let attendanceId = input.attendanceId;

    if (input.kind === "in") {
      const { data, error } = await scoped
        .table("hr_shift_attendance")
        .insert({
          work_shift_id: input.workShiftId,
          status: input.status,
          actual_start_time: time,
          actual_end_time: null,
          late_minutes: input.lateMinutes,
          notes: null,
          registration_source: "employee_portal",
          registered_by_employee_id: input.employeeId,
          registered_at: input.serverAt,
          updated_at: input.serverAt,
          location_id: input.locationId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      attendanceId = (data as unknown as { id: string }).id;
    } else {
      const { error } = await scoped
        .table("hr_shift_attendance")
        .update({ actual_end_time: time, status: input.status, updated_at: input.serverAt })
        .eq("id", attendanceId!)
        .is("actual_end_time", null);
      if (error) throw new Error(error.message);
    }

    const { data, error } = await scoped
      .table("hr_attendance_punch_events")
      .insert({
        attendance_id: attendanceId,
        employee_id: input.employeeId,
        location_id: input.locationId,
        work_shift_id: input.workShiftId,
        kind: input.kind,
        server_at: input.serverAt,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy_m: input.accuracyM,
        distance_m: input.distanceM,
        geofence_status: input.geofenceStatus,
        unverified_reason: input.unverifiedReason,
        source: "employee_portal",
        idempotency_key: input.idempotencyKey,
        user_id: input.userId,
      })
      .select(EVENT_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return toEvent(data as unknown as EventRow);
  }
}
