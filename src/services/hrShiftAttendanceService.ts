import type {
  HrShiftAttendance,
  RegistrationSource,
  ShiftAttendanceStatus,
  ShiftAttendanceUpsertBody,
} from "../domain/hrTypes.js";
import { getSupabaseServiceRole, isHrSupabaseConfigured } from "../infra/supabaseClient.js";
import { formatHrTimeForApi, normalizeTimeForPg } from "../utils/hrTime.js";

type AttendanceRow = {
  id: string;
  work_shift_id: string;
  status: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  late_minutes: number | null;
  notes: string | null;
  registration_source: string;
  registered_by_employee_id: string | null;
  registered_at: string;
  updated_at: string;
};

function rowToAttendance(row: AttendanceRow): HrShiftAttendance {
  const st = row.status as ShiftAttendanceStatus;
  const src = row.registration_source as RegistrationSource;
  return {
    id: row.id,
    workShiftId: row.work_shift_id,
    status: st,
    actualStartTime: row.actual_start_time
      ? formatHrTimeForApi(row.actual_start_time)
      : null,
    actualEndTime: row.actual_end_time
      ? formatHrTimeForApi(row.actual_end_time)
      : null,
    lateMinutes: row.late_minutes,
    notes: row.notes,
    registrationSource:
      src === "employee_qr" || src === "import" ? src : "dashboard",
    registeredByEmployeeId: row.registered_by_employee_id,
    registeredAt: row.registered_at,
    updatedAt: row.updated_at,
  };
}

function requireHr() {
  if (!isHrSupabaseConfigured()) {
    throw new Error(
      "RH não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  const s = getSupabaseServiceRole();
  if (!s) {
    throw new Error("Supabase service role indisponível");
  }
  return s;
}

const attendanceSelect =
  "id, work_shift_id, status, actual_start_time, actual_end_time, late_minutes, notes, registration_source, registered_by_employee_id, registered_at, updated_at";

/** Carrega conferências para vários turnos (uma query). */
export async function getAttendanceByShiftIds(
  shiftIds: string[],
): Promise<Map<string, HrShiftAttendance>> {
  const map = new Map<string, HrShiftAttendance>();
  if (shiftIds.length === 0) return map;

  const supabase = requireHr();
  const { data, error } = await supabase
    .from("hr_shift_attendance")
    .select(attendanceSelect)
    .in("work_shift_id", shiftIds);

  if (error) {
    throw new Error(`RH conferência turnos: ${error.message}`);
  }
  for (const row of (data ?? []) as AttendanceRow[]) {
    map.set(row.work_shift_id, rowToAttendance(row));
  }
  return map;
}

export async function getShiftEmployeeId(
  shiftId: string,
): Promise<string | null> {
  const supabase = requireHr();
  const { data, error } = await supabase
    .from("hr_work_shifts")
    .select("employee_id")
    .eq("id", shiftId)
    .maybeSingle();

  if (error) {
    throw new Error(`RH turno: ${error.message}`);
  }
  if (!data) return null;
  return (data as { employee_id: string }).employee_id;
}

/**
 * Cria ou substitui a conferência do turno (corpo completo).
 * `registration_source=employee_qr`: se `registeredByEmployeeId` for enviado, deve coincidir com o funcionário do turno.
 */
export async function upsertShiftAttendance(
  shiftId: string,
  body: ShiftAttendanceUpsertBody,
): Promise<HrShiftAttendance> {
  const employeeId = await getShiftEmployeeId(shiftId);
  if (!employeeId) {
    throw new Error("Turno não encontrado");
  }

  if (
    body.registrationSource === "employee_qr" &&
    body.registeredByEmployeeId != null &&
    body.registeredByEmployeeId !== employeeId
  ) {
    throw new Error(
      "Com registrationSource employee_qr, registeredByEmployeeId deve ser o funcionário do turno",
    );
  }

  const now = new Date().toISOString();
  const row = {
    work_shift_id: shiftId,
    status: body.status,
    actual_start_time:
      body.actualStartTime != null
        ? normalizeTimeForPg(body.actualStartTime)
        : null,
    actual_end_time:
      body.actualEndTime != null
        ? normalizeTimeForPg(body.actualEndTime)
        : null,
    late_minutes: body.lateMinutes ?? null,
    notes: body.notes != null ? body.notes.trim() || null : null,
    registration_source: body.registrationSource ?? "dashboard",
    registered_by_employee_id: body.registeredByEmployeeId ?? null,
    registered_at: now,
    updated_at: now,
  };

  const supabase = requireHr();
  const { data, error } = await supabase
    .from("hr_shift_attendance")
    .upsert(row, { onConflict: "work_shift_id" })
    .select(attendanceSelect)
    .single();

  if (error) {
    throw new Error(`RH conferência: ${error.message}`);
  }
  return rowToAttendance(data as AttendanceRow);
}
