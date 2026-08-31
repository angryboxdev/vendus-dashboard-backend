import type {
  HrShiftAttendance,
  HrWorkShift,
  ShiftCreateBody,
  ShiftUpdateBody,
} from "../domain/hrTypes.js";
import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";
import { formatHrTimeForApi, normalizeTimeForPg } from "../utils/hrTime.js";
import { REPORT_TIMEZONE } from "../utils/lisbonDayInstants.js";
import { DateTime } from "luxon";
import { getAttendanceByShiftIds } from "./hrShiftAttendanceService.js";

type Row = {
  id: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  location_or_station: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToShift(
  row: Row,
  attendance: HrShiftAttendance | null,
): HrWorkShift {
  return {
    id: row.id,
    employeeId: row.employee_id,
    workDate: row.work_date,
    startTime: formatHrTimeForApi(row.start_time),
    endTime: formatHrTimeForApi(row.end_time),
    locationOrStation: row.location_or_station,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attendance,
  };
}

export function assertValidShiftRange(fromYmd: string, toYmd: string): void {
  const a = DateTime.fromISO(fromYmd, { zone: REPORT_TIMEZONE }).startOf("day");
  const b = DateTime.fromISO(toYmd, { zone: REPORT_TIMEZONE }).startOf("day");
  if (!a.isValid || !b.isValid) {
    throw new Error("Intervalo de datas inválido");
  }
  if (a > b) {
    throw new Error("`from` deve ser anterior ou igual a `to`");
  }
}

export async function getWorkShiftById(
  organizationId: OrganizationId,
  id: string,
): Promise<HrWorkShift | null> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("hr_work_shifts")
    .select(
      "id, employee_id, work_date, start_time, end_time, location_or_station, notes, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`RH turno: ${error.message}`);
  }
  if (!data) return null;
  const row = data as unknown as Row;
  const attMap = await getAttendanceByShiftIds(organizationId, [id]);
  return rowToShift(row, attMap.get(id) ?? null);
}

export async function listShiftsInRange(
  organizationId: OrganizationId,
  options: {
    from: string;
    to: string;
    employeeId?: string;
  },
): Promise<HrWorkShift[]> {
  assertValidShiftRange(options.from, options.to);
  let q = createScopedQuery(organizationId)
    .table("hr_work_shifts")
    .select(
      "id, employee_id, work_date, start_time, end_time, location_or_station, notes, created_at, updated_at",
    )
    .gte("work_date", options.from)
    .lte("work_date", options.to)
    .order("work_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (options.employeeId) {
    q = q.eq("employee_id", options.employeeId);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`RH turnos: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as Row[];
  const ids = rows.map((r) => r.id);
  const attendanceMap = await getAttendanceByShiftIds(organizationId, ids);
  return rows.map((r) =>
    rowToShift(r, attendanceMap.get(r.id) ?? null),
  );
}

function assertStartBeforeEnd(start: string, end: string): void {
  const s = normalizeTimeForPg(start);
  const e = normalizeTimeForPg(end);
  if (s >= e) {
    throw new Error("startTime deve ser anterior a endTime no mesmo dia");
  }
}

/**
 * `location_id` (spec B2 D3/D4): `hr_work_shifts` é location-bearing
 * (`location_id` NOT NULL). `body.locationId` é obrigatório na criação
 * (`shiftCreateBodySchema`) e vem do chamador — um manager autenticado, não
 * do unattended scope (esse é só o caminho do kiosk, D14).
 */
export async function createShift(
  organizationId: OrganizationId,
  body: ShiftCreateBody,
): Promise<HrWorkShift> {
  assertStartBeforeEnd(body.startTime, body.endTime);
  const now = new Date().toISOString();
  const insert = {
    employee_id: body.employeeId,
    work_date: body.workDate,
    start_time: normalizeTimeForPg(body.startTime),
    end_time: normalizeTimeForPg(body.endTime),
    location_or_station: body.locationOrStation?.trim() || null,
    notes: body.notes?.trim() || null,
    updated_at: now,
    location_id: body.locationId,
  };

  const { data, error } = await createScopedQuery(organizationId)
    .table("hr_work_shifts")
    .insert(insert)
    .select(
      "id, employee_id, work_date, start_time, end_time, location_or_station, notes, created_at, updated_at",
    )
    .single();

  if (error) {
    throw new Error(`RH criar turno: ${error.message}`);
  }
  return rowToShift(data as unknown as Row, null);
}

export async function updateShift(
  organizationId: OrganizationId,
  id: string,
  body: ShiftUpdateBody,
): Promise<HrWorkShift> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.workDate !== undefined) patch.work_date = body.workDate;
  if (body.startTime !== undefined) {
    patch.start_time = normalizeTimeForPg(body.startTime);
  }
  if (body.endTime !== undefined) {
    patch.end_time = normalizeTimeForPg(body.endTime);
  }
  if (body.locationOrStation !== undefined) {
    patch.location_or_station = body.locationOrStation?.trim() || null;
  }
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
  if (body.employeeId !== undefined) patch.employee_id = body.employeeId;
  // location_id (spec B2 D3/D4): only touched when the caller supplies it —
  // a PATCH that doesn't mention location leaves the shift's current store alone.
  if (body.locationId !== undefined) patch.location_id = body.locationId;

  const scoped = createScopedQuery(organizationId);

  const { data: current, error: fetchErr } = await scoped
    .table("hr_work_shifts")
    .select("start_time, end_time")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    throw new Error(
      fetchErr ? `RH turno: ${fetchErr.message}` : "Turno não encontrado",
    );
  }

  const cur = current as unknown as { start_time: string; end_time: string };
  const start =
    patch.start_time != null
      ? String(patch.start_time)
      : normalizeTimeForPg(cur.start_time);
  const end =
    patch.end_time != null
      ? String(patch.end_time)
      : normalizeTimeForPg(cur.end_time);
  assertStartBeforeEnd(start, end);

  const { data, error } = await scoped
    .table("hr_work_shifts")
    .update(patch)
    .eq("id", id)
    .select(
      "id, employee_id, work_date, start_time, end_time, location_or_station, notes, created_at, updated_at",
    )
    .single();

  if (error) {
    throw new Error(`RH atualizar turno: ${error.message}`);
  }
  const attMap = await getAttendanceByShiftIds(organizationId, [id]);
  return rowToShift(data as unknown as Row, attMap.get(id) ?? null);
}

export async function deleteShift(organizationId: OrganizationId, id: string): Promise<void> {
  const { error } = await createScopedQuery(organizationId)
    .table("hr_work_shifts")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`RH eliminar turno: ${error.message}`);
  }
}
