import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { formatHrTimeForApi, normalizeTimeForPg } from "../../../../utils/hrTime.js";
import type { AttendanceSnapshotRow, AttendanceWritePort, UpsertAttendanceInput } from "../../domain/ports/out/attendance-write.port.js";

const SELECT = "id, work_shift_id, employee_id, work_date, location_id, status, actual_start_time, actual_end_time, late_minutes, registration_source";

interface Row {
  id: string;
  work_shift_id: string | null;
  employee_id: string;
  work_date: string;
  location_id: string;
  status: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  late_minutes: number | null;
  registration_source: string;
}

function rowToSnapshot(row: Row): AttendanceSnapshotRow {
  return {
    id: row.id,
    workShiftId: row.work_shift_id,
    employeeId: row.employee_id,
    workDate: row.work_date,
    locationId: row.location_id,
    status: row.status,
    actualStartTime: row.actual_start_time ? formatHrTimeForApi(row.actual_start_time) : null,
    actualEndTime: row.actual_end_time ? formatHrTimeForApi(row.actual_end_time) : null,
    lateMinutes: row.late_minutes,
    registrationSource: row.registration_source,
  };
}

/**
 * Write path de `hr_shift_attendance` a partir do módulo novo (Fase 2) —
 * usado só por `CorrectShiftAttendanceUseCase`. Diferente da rota legacy:
 * atualiza por `id` explícito (nunca por `work_shift_id` via upsert
 * genérico), o que permite representar também presença sem escala
 * (`work_shift_id` NULL).
 */
export class SupabaseAttendanceWriteAdapter implements AttendanceWritePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId, attendanceId: string): Promise<AttendanceSnapshotRow | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_shift_attendance")
      .select(SELECT)
      .eq("id", attendanceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToSnapshot(data as unknown as Row) : null;
  }

  async upsert(organizationId: OrganizationId, input: UpsertAttendanceInput): Promise<AttendanceSnapshotRow> {
    const payload = {
      work_shift_id: input.workShiftId,
      employee_id: input.employeeId,
      work_date: input.workDate,
      location_id: input.locationId,
      status: input.status,
      actual_start_time: input.actualStartTime ? normalizeTimeForPg(input.actualStartTime) : null,
      actual_end_time: input.actualEndTime ? normalizeTimeForPg(input.actualEndTime) : null,
      late_minutes: input.lateMinutes,
      notes: input.notes,
      registration_source: input.registrationSource,
      registered_by_employee_id: input.registeredByEmployeeId,
      updated_at: new Date().toISOString(),
    };

    if (input.attendanceId) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("hr_shift_attendance")
        .update(payload)
        .eq("id", input.attendanceId)
        .select(SELECT)
        .single();
      if (error) throw new Error(error.message);
      return rowToSnapshot(data as unknown as Row);
    }

    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_shift_attendance")
      .insert({ ...payload, registered_at: new Date().toISOString() })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToSnapshot(data as unknown as Row);
  }
}
