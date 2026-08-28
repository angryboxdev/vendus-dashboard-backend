import type {
  HrShiftAttendance,
  HrWorkShift,
  ShiftCreateBody,
  ShiftUpdateBody,
} from "../domain/hrTypes.js";
import { getSupabaseServiceRole, isHrSupabaseConfigured } from "../infra/scoped-db/supabase-client.js";
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

export async function getWorkShiftById(id: string): Promise<HrWorkShift | null> {
  const supabase = requireHr();
  const { data, error } = await supabase
    .from("hr_work_shifts")
    .select(
      "id, employee_id, work_date, start_time, end_time, location_or_station, notes, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`RH turno: ${error.message}`);
  }
  if (!data) return null;
  const row = data as Row;
  const attMap = await getAttendanceByShiftIds([id]);
  return rowToShift(row, attMap.get(id) ?? null);
}

export async function listShiftsInRange(options: {
  from: string;
  to: string;
  employeeId?: string;
}): Promise<HrWorkShift[]> {
  assertValidShiftRange(options.from, options.to);
  const supabase = requireHr();
  let q = supabase
    .from("hr_work_shifts")
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
  const rows = (data ?? []) as Row[];
  const ids = rows.map((r) => r.id);
  const attendanceMap = await getAttendanceByShiftIds(ids);
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

export async function createShift(body: ShiftCreateBody): Promise<HrWorkShift> {
  assertStartBeforeEnd(body.startTime, body.endTime);
  const supabase = requireHr();
  const now = new Date().toISOString();
  const insert = {
    employee_id: body.employeeId,
    work_date: body.workDate,
    start_time: normalizeTimeForPg(body.startTime),
    end_time: normalizeTimeForPg(body.endTime),
    location_or_station: body.locationOrStation?.trim() || null,
    notes: body.notes?.trim() || null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("hr_work_shifts")
    .insert(insert)
    .select(
      "id, employee_id, work_date, start_time, end_time, location_or_station, notes, created_at, updated_at",
    )
    .single();

  if (error) {
    throw new Error(`RH criar turno: ${error.message}`);
  }
  return rowToShift(data as Row, null);
}

export async function updateShift(
  id: string,
  body: ShiftUpdateBody,
): Promise<HrWorkShift> {
  const supabase = requireHr();
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

  const { data: current, error: fetchErr } = await supabase
    .from("hr_work_shifts")
    .select("start_time, end_time")
    .eq("id", id)
    .single();

  if (fetchErr || !current) {
    throw new Error(
      fetchErr ? `RH turno: ${fetchErr.message}` : "Turno não encontrado",
    );
  }

  const cur = current as { start_time: string; end_time: string };
  const start =
    patch.start_time != null
      ? String(patch.start_time)
      : normalizeTimeForPg(cur.start_time);
  const end =
    patch.end_time != null
      ? String(patch.end_time)
      : normalizeTimeForPg(cur.end_time);
  assertStartBeforeEnd(start, end);

  const { data, error } = await supabase
    .from("hr_work_shifts")
    .update(patch)
    .eq("id", id)
    .select(
      "id, employee_id, work_date, start_time, end_time, location_or_station, notes, created_at, updated_at",
    )
    .single();

  if (error) {
    throw new Error(`RH atualizar turno: ${error.message}`);
  }
  const attMap = await getAttendanceByShiftIds([id]);
  return rowToShift(data as Row, attMap.get(id) ?? null);
}

export async function deleteShift(id: string): Promise<void> {
  const supabase = requireHr();
  const { error } = await supabase.from("hr_work_shifts").delete().eq("id", id);
  if (error) {
    throw new Error(`RH eliminar turno: ${error.message}`);
  }
}
