import type {
  HrShiftAttendance,
  RegistrationSource,
  ShiftAttendanceStatus,
  ShiftAttendanceUpsertBody,
} from "../domain/hrTypes.js";
import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";
import { formatHrTimeForApi, normalizeTimeForPg } from "../utils/hrTime.js";

type AttendanceRow = {
  id: string;
  work_shift_id: string;
  status: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  late_minutes: number | null;
  notes: string | null;
  location_id: string;
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
    locationId: row.location_id,
    registrationSource:
      src === "employee_qr" || src === "import" ? src : "dashboard",
    registeredByEmployeeId: row.registered_by_employee_id,
    registeredAt: row.registered_at,
    updatedAt: row.updated_at,
  };
}

const attendanceSelect =
  "id, work_shift_id, status, actual_start_time, actual_end_time, late_minutes, notes, location_id, registration_source, registered_by_employee_id, registered_at, updated_at";

/** Carrega conferências para vários turnos (uma query). */
export async function getAttendanceByShiftIds(
  organizationId: OrganizationId,
  shiftIds: string[],
): Promise<Map<string, HrShiftAttendance>> {
  const map = new Map<string, HrShiftAttendance>();
  if (shiftIds.length === 0) return map;

  const { data, error } = await createScopedQuery(organizationId)
    .table("hr_shift_attendance")
    .select(attendanceSelect)
    .in("work_shift_id", shiftIds);

  if (error) {
    throw new Error(`RH conferência turnos: ${error.message}`);
  }
  for (const row of (data ?? []) as unknown as AttendanceRow[]) {
    map.set(row.work_shift_id, rowToAttendance(row));
  }
  return map;
}

export async function getShiftEmployeeId(
  organizationId: OrganizationId,
  shiftId: string,
): Promise<string | null> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("hr_work_shifts")
    .select("employee_id")
    .eq("id", shiftId)
    .maybeSingle();

  if (error) {
    throw new Error(`RH turno: ${error.message}`);
  }
  if (!data) return null;
  return (data as unknown as { employee_id: string }).employee_id;
}

/** Remove a conferência de um turno (volta ao estado "sem conferência"). */
export async function deleteShiftAttendance(
  organizationId: OrganizationId,
  shiftId: string,
): Promise<void> {
  const { error } = await createScopedQuery(organizationId)
    .table("hr_shift_attendance")
    .delete()
    .eq("work_shift_id", shiftId);
  if (error) {
    throw new Error(`RH apagar conferência: ${error.message}`);
  }
}

/**
 * Cria ou substitui a conferência do turno (corpo completo).
 * `registration_source=employee_qr`: se `registeredByEmployeeId` for enviado, deve coincidir com o funcionário do turno.
 *
 * `location_id` (spec B2 D3/D4): `hr_shift_attendance` é location-bearing e
 * este upsert substitui a linha inteira, por isso `body.locationId` (validado
 * como obrigatório em `shiftAttendanceUpsertBodySchema`) é sempre escrito.
 */
export async function upsertShiftAttendance(
  organizationId: OrganizationId,
  shiftId: string,
  body: ShiftAttendanceUpsertBody,
): Promise<HrShiftAttendance> {
  const employeeId = await getShiftEmployeeId(organizationId, shiftId);
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
    location_id: body.locationId,
  };

  const { data, error } = await createScopedQuery(organizationId)
    .table("hr_shift_attendance")
    .upsert(row, { onConflict: "work_shift_id" })
    .select(attendanceSelect)
    .single();

  if (error) {
    throw new Error(`RH conferência: ${error.message}`);
  }
  return rowToAttendance(data as unknown as AttendanceRow);
}
