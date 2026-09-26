import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { formatHrTimeForApi } from "../../../../utils/hrTime.js";
import type {
  ShiftAttendanceReadPort,
  ShiftAttendanceStatus,
  ShiftOccurrence,
} from "../../domain/ports/out/shift-attendance-read.port.js";

interface ShiftRow {
  id: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  location_id: string;
}

interface AttendanceRow {
  work_shift_id: string;
  status: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  late_minutes: number | null;
}

/**
 * Cross-module: lê `hr_work_shifts` + `hr_shift_attendance` (módulo legacy)
 * diretamente via `ScopedQueryFactory` — padrão D10, sem importar
 * `hrShiftService.ts`/`hrShiftAttendanceService.ts`. Duas queries (turnos,
 * depois presenças por `work_shift_id`) em vez de um embed do PostgREST —
 * mesma abordagem que o próprio `hrShiftService.ts` já usa
 * (`getAttendanceByShiftIds`), evita depender do nome exato de uma
 * constraint de FK.
 */
export class SupabaseShiftAttendanceReadAdapter implements ShiftAttendanceReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findShiftsInRange(
    organizationId: OrganizationId,
    range: { from: string; to: string; locationId?: string },
  ): Promise<ShiftOccurrence[]> {
    let q = this.scopedQuery(organizationId)
      .table("hr_work_shifts")
      .select("id, employee_id, work_date, start_time, end_time, location_id")
      .gte("work_date", range.from)
      .lte("work_date", range.to);
    if (range.locationId) q = q.eq("location_id", range.locationId);

    const { data: shiftRows, error: shiftError } = await q;
    if (shiftError) throw new Error(shiftError.message);
    const shifts = (shiftRows ?? []) as unknown as ShiftRow[];
    if (shifts.length === 0) return [];

    const shiftIds = shifts.map((s) => s.id);
    const { data: attendanceRows, error: attendanceError } = await this.scopedQuery(organizationId)
      .table("hr_shift_attendance")
      .select("work_shift_id, status, actual_start_time, actual_end_time, late_minutes")
      .in("work_shift_id", shiftIds);
    if (attendanceError) throw new Error(attendanceError.message);

    const attendanceByShiftId = new Map<string, AttendanceRow>();
    for (const row of (attendanceRows ?? []) as unknown as AttendanceRow[]) {
      attendanceByShiftId.set(row.work_shift_id, row);
    }

    return shifts.map((s) => {
      const attendance = attendanceByShiftId.get(s.id);
      return {
        shiftId: s.id,
        employeeId: s.employee_id,
        workDate: s.work_date,
        startTime: formatHrTimeForApi(s.start_time),
        endTime: formatHrTimeForApi(s.end_time),
        locationId: s.location_id,
        attendanceStatus: (attendance?.status as ShiftAttendanceStatus | undefined) ?? null,
        actualStartTime: attendance?.actual_start_time ? formatHrTimeForApi(attendance.actual_start_time) : null,
        actualEndTime: attendance?.actual_end_time ? formatHrTimeForApi(attendance.actual_end_time) : null,
        lateMinutes: attendance?.late_minutes ?? null,
      };
    });
  }
}
