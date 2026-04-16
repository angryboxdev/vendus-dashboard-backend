import { getSupabaseServiceRole } from "../infra/supabaseClient.js";
import type { WeeklySchedule } from "../domain/hrTypes.js";

// ---------- types ----------

export type LeaveType = "vacation" | "sick_leave" | "justified" | "unjustified";

export interface HrPublicHoliday {
  id: string;
  date: string;
  name: string;
  isNational: boolean;
}

export interface HrLeaveRequest {
  id: string;
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  workingDays: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HrLeaveBalance {
  id: string;
  employeeId: string;
  year: number;
  daysEntitled: number;
  daysCarriedOver: number;
  daysUsed: number;
  daysRemaining: number;
  notes: string | null;
}

// ---------- helpers ----------

/** Converte weekday JS (0=Dom) para índice interno (0=Seg…6=Dom) */
function jsToInternalWeekday(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/** Retorna o conjunto de weekdays internos (0=Seg…6=Dom) em que o funcionário trabalha */
function getWorkingWeekdays(schedule: WeeklySchedule | null): Set<number> {
  if (!schedule?.days?.length) {
    // Sem escala definida → assume seg-sex (0-4)
    return new Set([0, 1, 2, 3, 4]);
  }
  return new Set(schedule.days.map((d) => d.weekday));
}

/** Itera de startDate até endDate (inclusive) em YYYY-MM-DD */
function* eachDay(startDate: string, endDate: string): Generator<Date> {
  const cur = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");
  while (cur <= end) {
    yield new Date(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------- public holidays ----------

export async function getPublicHolidays(year?: number): Promise<HrPublicHoliday[]> {
  const sb = getSupabaseServiceRole();
  if (!sb) return [];

  let query = sb.from("hr_public_holidays").select("*").order("date");
  if (year != null) {
    query = query
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    name: r.name as string,
    isNational: r.is_national as boolean,
  }));
}

export async function createPublicHoliday(
  date: string,
  name: string,
  isNational = false,
): Promise<HrPublicHoliday> {
  const sb = getSupabaseServiceRole();
  if (!sb) throw new Error("Supabase indisponível");

  const { data, error } = await sb
    .from("hr_public_holidays")
    .insert({ date, name, is_national: isNational })
    .select()
    .single();

  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return { id: r.id as string, date: r.date as string, name: r.name as string, isNational: r.is_national as boolean };
}

export async function deletePublicHoliday(id: string): Promise<void> {
  const sb = getSupabaseServiceRole();
  if (!sb) throw new Error("Supabase indisponível");
  const { error } = await sb.from("hr_public_holidays").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- working days calculation ----------

export async function calculateWorkingDays(
  startDate: string,
  endDate: string,
  schedule: WeeklySchedule | null,
): Promise<number> {
  const sb = getSupabaseServiceRole();
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));

  // Fetch all holidays in range
  const holidaySet = new Set<string>();
  if (sb) {
    const { data } = await sb
      .from("hr_public_holidays")
      .select("date")
      .gte("date", `${startYear}-01-01`)
      .lte("date", `${endYear}-12-31`);
    (data ?? []).forEach((r) => holidaySet.add(r.date as string));
  }

  const workingWeekdays = getWorkingWeekdays(schedule);
  let count = 0;

  for (const day of eachDay(startDate, endDate)) {
    const ymd = toYmd(day);
    const internalWd = jsToInternalWeekday(day.getUTCDay());
    if (workingWeekdays.has(internalWd) && !holidaySet.has(ymd)) {
      count++;
    }
  }

  return count;
}

// ---------- leave requests ----------

function mapLeaveRow(r: Record<string, unknown>): HrLeaveRequest {
  return {
    id: r.id as string,
    employeeId: r.employee_id as string,
    type: r.type as LeaveType,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    workingDays: r.working_days as number,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function getLeaveRequests(params: {
  employeeId?: string;
  year?: number;
  type?: LeaveType;
}): Promise<HrLeaveRequest[]> {
  const sb = getSupabaseServiceRole();
  if (!sb) return [];

  let q = sb.from("hr_leave_requests").select("*").order("start_date");
  if (params.employeeId) q = q.eq("employee_id", params.employeeId);
  if (params.type) q = q.eq("type", params.type);
  if (params.year != null) {
    q = q
      .gte("start_date", `${params.year}-01-01`)
      .lte("start_date", `${params.year}-12-31`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapLeaveRow(r as Record<string, unknown>));
}

export async function createLeaveRequest(body: {
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  workingDays: number;
  notes?: string | null;
}): Promise<HrLeaveRequest> {
  const sb = getSupabaseServiceRole();
  if (!sb) throw new Error("Supabase indisponível");

  const { data, error } = await sb
    .from("hr_leave_requests")
    .insert({
      employee_id: body.employeeId,
      type: body.type,
      start_date: body.startDate,
      end_date: body.endDate,
      working_days: body.workingDays,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapLeaveRow(data as Record<string, unknown>);
}

export async function updateLeaveRequest(
  id: string,
  body: {
    type?: LeaveType;
    startDate?: string;
    endDate?: string;
    workingDays?: number;
    notes?: string | null;
  },
): Promise<HrLeaveRequest> {
  const sb = getSupabaseServiceRole();
  if (!sb) throw new Error("Supabase indisponível");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.type != null) patch.type = body.type;
  if (body.startDate != null) patch.start_date = body.startDate;
  if (body.endDate != null) patch.end_date = body.endDate;
  if (body.workingDays != null) patch.working_days = body.workingDays;
  if ("notes" in body) patch.notes = body.notes ?? null;

  const { data, error } = await sb
    .from("hr_leave_requests")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") throw Object.assign(new Error("Ausência não encontrada"), { status: 404 });
    throw new Error(error.message);
  }
  return mapLeaveRow(data as Record<string, unknown>);
}

export async function deleteLeaveRequest(id: string): Promise<void> {
  const sb = getSupabaseServiceRole();
  if (!sb) throw new Error("Supabase indisponível");
  const { error } = await sb.from("hr_leave_requests").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- leave balances ----------

/**
 * Sugere dias de férias com base na data de contratação.
 * Código do Trabalho art. 238:
 *  - 1º ano: 2 dias por mês completo trabalhado, máx. 20.
 *  - Anos seguintes: 22 dias úteis.
 */
export function suggestDaysEntitled(hiredAt: string | null, year: number): number {
  if (!hiredAt) return 22;
  const hireYear = Number(hiredAt.slice(0, 4));
  if (hireYear < year) return 22;
  if (hireYear > year) return 0;

  // Mesmo ano: 2 dias por mês completo trabalhado até 31 dez do ano
  const hireDate = new Date(hiredAt + "T12:00:00Z");
  const yearEnd = new Date(`${year}-12-31T12:00:00Z`);
  const monthsWorked = Math.floor(
    (yearEnd.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  );
  return Math.min(monthsWorked * 2, 20);
}

export async function getLeaveBalance(
  employeeId: string,
  year: number,
  hiredAt: string | null = null,
): Promise<HrLeaveBalance> {
  const sb = getSupabaseServiceRole();
  if (!sb) throw new Error("Supabase indisponível");

  // Fetch or create balance row
  let { data, error } = await sb
    .from("hr_leave_balances")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("year", year)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    const suggested = suggestDaysEntitled(hiredAt, year);
    const daysEntitled = (Number.isFinite(suggested) && suggested >= 0) ? suggested : 22;
    const insert = await sb
      .from("hr_leave_balances")
      .insert({ employee_id: employeeId, year, days_entitled: daysEntitled })
      .select()
      .single();
    if (insert.error) throw new Error(insert.error.message);
    data = insert.data;
  }

  const row = data as Record<string, unknown>;

  // Calculate used days from vacation requests only (other types don't deduct)
  const { data: used } = await sb
    .from("hr_leave_requests")
    .select("working_days")
    .eq("employee_id", employeeId)
    .eq("type", "vacation")
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`);

  const daysUsed = (used ?? []).reduce((s, r) => s + ((r as Record<string, unknown>).working_days as number), 0);
  const daysEntitled = row.days_entitled as number;
  const daysCarriedOver = row.days_carried_over as number;

  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    year,
    daysEntitled,
    daysCarriedOver,
    daysUsed,
    daysRemaining: daysEntitled + daysCarriedOver - daysUsed,
    notes: (row.notes as string | null) ?? null,
  };
}

export async function updateLeaveBalance(
  employeeId: string,
  year: number,
  body: { daysEntitled?: number; daysCarriedOver?: number; notes?: string | null },
): Promise<void> {
  const sb = getSupabaseServiceRole();
  if (!sb) throw new Error("Supabase indisponível");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.daysEntitled != null) patch.days_entitled = body.daysEntitled;
  if (body.daysCarriedOver != null) patch.days_carried_over = body.daysCarriedOver;
  if ("notes" in body) patch.notes = body.notes ?? null;

  const { error } = await sb
    .from("hr_leave_balances")
    .upsert({ employee_id: employeeId, year, ...patch }, { onConflict: "employee_id,year" });

  if (error) throw new Error(error.message);
}

// ---------- overview (global page) ----------

export async function getLeaveOverview(year: number): Promise<HrLeaveRequest[]> {
  return getLeaveRequests({ year });
}
