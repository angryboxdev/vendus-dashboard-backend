import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { formatHrTimeForApi, normalizeTimeForPg } from "../../../../utils/hrTime.js";
import type {
  AttendanceCorrectionDTO,
  AttendanceCorrectionRecord,
  AttendanceCorrectionRepositoryPort,
  AttendanceCorrectionType,
  AttendanceSnapshot,
} from "../../domain/ports/out/attendance-correction-repository.port.js";

const SELECT =
  "id, work_shift_id, employee_id, work_date, correction_type, original_status, original_start_time, original_end_time, corrected_status, corrected_start_time, corrected_end_time, reason, notes, actor, created_at";

interface Row {
  id: string;
  work_shift_id: string | null;
  employee_id: string;
  work_date: string;
  correction_type: AttendanceCorrectionType;
  original_status: string | null;
  original_start_time: string | null;
  original_end_time: string | null;
  corrected_status: string | null;
  corrected_start_time: string | null;
  corrected_end_time: string | null;
  reason: string;
  notes: string | null;
  actor: string;
  created_at: string;
}

function snapshotOrNull(status: string | null, start: string | null, end: string | null): AttendanceSnapshot | null {
  if (status == null && start == null && end == null) return null;
  return {
    status,
    actualStartTime: start ? formatHrTimeForApi(start) : null,
    actualEndTime: end ? formatHrTimeForApi(end) : null,
  };
}

function rowToDto(row: Row): AttendanceCorrectionDTO {
  return {
    id: row.id,
    workShiftId: row.work_shift_id,
    employeeId: row.employee_id,
    workDate: row.work_date,
    correctionType: row.correction_type,
    original: snapshotOrNull(row.original_status, row.original_start_time, row.original_end_time),
    corrected: snapshotOrNull(row.corrected_status, row.corrected_start_time, row.corrected_end_time),
    reason: row.reason,
    notes: row.notes,
    actor: row.actor,
    createdAt: row.created_at,
  };
}

/** Ledger só de inserção (Fase 2) — nunca atualizado nem apagado. */
export class SupabaseAttendanceCorrectionRepository implements AttendanceCorrectionRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async record(entry: AttendanceCorrectionRecord): Promise<AttendanceCorrectionDTO> {
    const { data, error } = await this.scopedQuery(entry.organizationId)
      .table("hr_attendance_corrections")
      .insert({
        id: randomUUID(),
        work_shift_id: entry.workShiftId,
        employee_id: entry.employeeId,
        work_date: entry.workDate,
        correction_type: entry.correctionType,
        original_status: entry.original?.status ?? null,
        original_start_time: entry.original?.actualStartTime ? normalizeTimeForPg(entry.original.actualStartTime) : null,
        original_end_time: entry.original?.actualEndTime ? normalizeTimeForPg(entry.original.actualEndTime) : null,
        corrected_status: entry.corrected?.status ?? null,
        corrected_start_time: entry.corrected?.actualStartTime ? normalizeTimeForPg(entry.corrected.actualStartTime) : null,
        corrected_end_time: entry.corrected?.actualEndTime ? normalizeTimeForPg(entry.corrected.actualEndTime) : null,
        reason: entry.reason,
        notes: entry.notes,
        actor: entry.actor,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToDto(data as unknown as Row);
  }

  async findByShiftId(organizationId: OrganizationId, workShiftId: string): Promise<AttendanceCorrectionDTO[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_attendance_corrections")
      .select(SELECT)
      .eq("work_shift_id", workShiftId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(rowToDto);
  }
}
