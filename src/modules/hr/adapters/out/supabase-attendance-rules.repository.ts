import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { AttendanceRulesRepositoryPort } from "../../domain/ports/out/attendance-rules-repository.port.js";
import type { AttendanceRulesVersion } from "../../domain/entities/attendance-rules.js";

const SELECT =
  "id, org_id, entry_tolerance_minutes, early_exit_tolerance_minutes, absence_threshold_minutes, pre_shift_window_minutes, post_shift_window_minutes, control_start_date, effective_from, changed_by, created_at";

interface Row {
  id: string;
  org_id: string;
  entry_tolerance_minutes: number;
  early_exit_tolerance_minutes: number;
  absence_threshold_minutes: number;
  pre_shift_window_minutes: number;
  post_shift_window_minutes: number;
  control_start_date: string | null;
  effective_from: string;
  changed_by: string;
  created_at: string;
}

function rowToVersion(row: Row): AttendanceRulesVersion {
  return {
    id: row.id,
    organizationId: row.org_id,
    entryToleranceMinutes: row.entry_tolerance_minutes,
    earlyExitToleranceMinutes: row.early_exit_tolerance_minutes,
    absenceThresholdMinutes: row.absence_threshold_minutes,
    preShiftWindowMinutes: row.pre_shift_window_minutes,
    postShiftWindowMinutes: row.post_shift_window_minutes,
    controlStartDate: row.control_start_date,
    effectiveFrom: row.effective_from,
    changedBy: row.changed_by,
    createdAt: row.created_at,
  };
}

/** `hr_attendance_rules` (Fase 2.1) — cada linha é uma versão completa, só INSERT, nunca UPDATE/DELETE. */
export class SupabaseAttendanceRulesRepository implements AttendanceRulesRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async listVersions(organizationId: OrganizationId): Promise<AttendanceRulesVersion[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_attendance_rules").select(SELECT).order("effective_from", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(rowToVersion);
  }

  async save(organizationId: OrganizationId, version: AttendanceRulesVersion): Promise<AttendanceRulesVersion> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_attendance_rules")
      .insert({
        id: version.id || randomUUID(),
        entry_tolerance_minutes: version.entryToleranceMinutes,
        early_exit_tolerance_minutes: version.earlyExitToleranceMinutes,
        absence_threshold_minutes: version.absenceThresholdMinutes,
        pre_shift_window_minutes: version.preShiftWindowMinutes,
        post_shift_window_minutes: version.postShiftWindowMinutes,
        control_start_date: version.controlStartDate,
        effective_from: version.effectiveFrom,
        changed_by: version.changedBy,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToVersion(data as unknown as Row);
  }
}
