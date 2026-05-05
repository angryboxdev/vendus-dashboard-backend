import {
  finalizeWeeklySchedule,
  weeklyScheduleSchema,
  type EmployeeCreateBody,
  type EmployeeStatus,
  type EmploymentType,
  type EmployeeUpdateBody,
  type HrEmployee,
  type JobRole,
  type WeeklySchedule,
} from "../domain/hrTypes.js";
import { getSupabaseServiceRole, isHrSupabaseConfigured } from "../infra/supabaseClient.js";
import { hashPin } from "../utils/kiosk.js";

type Row = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_or_notes: string | null;
  employment_type: string;
  job_role: string;
  weekly_schedule: unknown | null;
  status: string;
  hired_at: string | null;
  ended_at: string | null;
  base_salary: string | number | null;
  salary_type: string;
  hourly_rate: string | number | null;
  kiosk_pin_hash: string | null;
  created_at: string;
  updated_at: string;
};

const EMPLOYEE_SELECT =
  "id, full_name, email, phone, role_or_notes, employment_type, job_role, weekly_schedule, status, hired_at, ended_at, base_salary, salary_type, hourly_rate, kiosk_pin_hash, created_at, updated_at";

function weeklyScheduleFromDb(raw: unknown): WeeklySchedule | null {
  if (raw == null) return null;
  const p = weeklyScheduleSchema.safeParse(raw);
  if (!p.success) return null;
  return finalizeWeeklySchedule(p.data as WeeklySchedule);
}

function normalizeJobRole(raw: string): JobRole {
  if (raw === "manager" || raw === "prep" || raw === "service") {
    return raw;
  }
  return "service";
}

function rowToEmployee(row: Row): HrEmployee {
  const et = row.employment_type as EmploymentType;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    roleOrNotes: row.role_or_notes,
    employmentType:
      et === "contract" || et === "extra" ? et : "permanent",
    jobRole: normalizeJobRole(row.job_role),
    weeklySchedule: weeklyScheduleFromDb(row.weekly_schedule),
    status: row.status as EmployeeStatus,
    hiredAt: row.hired_at,
    endedAt: row.ended_at,
    baseSalary: row.base_salary != null ? Number(row.base_salary) : null,
    salaryType: row.salary_type === "hourly" ? "hourly" : "fixed",
    hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
    hasKioskPin: row.kiosk_pin_hash !== null,
    createdAt: row.created_at,
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

export async function listEmployees(options: {
  status: "active" | "inactive" | "all";
  limit: number;
  offset: number;
}): Promise<HrEmployee[]> {
  const supabase = requireHr();
  let q = supabase
    .from("hr_employees")
    .select(
      EMPLOYEE_SELECT,
    )
    .order("full_name", { ascending: true })
    .range(options.offset, options.offset + options.limit - 1);

  if (options.status !== "all") {
    q = q.eq("status", options.status);
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`RH funcionários: ${error.message}`);
  }
  return ((data ?? []) as Row[]).map(rowToEmployee);
}

export async function getEmployee(id: string): Promise<HrEmployee | null> {
  const supabase = requireHr();
  const { data, error } = await supabase
    .from("hr_employees")
    .select(
      EMPLOYEE_SELECT,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`RH funcionário: ${error.message}`);
  }
  if (!data) return null;
  return rowToEmployee(data as Row);
}

export async function createEmployee(
  body: EmployeeCreateBody,
): Promise<HrEmployee> {
  const supabase = requireHr();
  const now = new Date().toISOString();
  let weekly_schedule: WeeklySchedule | null = null;
  if (body.weeklySchedule !== undefined) {
    if (body.weeklySchedule === null) {
      weekly_schedule = null;
    } else {
      weekly_schedule = finalizeWeeklySchedule(
        body.weeklySchedule as WeeklySchedule,
      );
    }
  }

  const insert = {
    full_name: body.fullName.trim(),
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    role_or_notes: body.roleOrNotes?.trim() || null,
    employment_type: body.employmentType ?? "permanent",
    job_role: body.jobRole ?? "service",
    weekly_schedule,
    status: body.status ?? "active",
    hired_at: body.hiredAt ?? null,
    ended_at: body.endedAt ?? null,
    base_salary: body.baseSalary ?? null,
    salary_type: body.salaryType ?? "fixed",
    hourly_rate: body.hourlyRate ?? null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("hr_employees")
    .insert(insert)
    .select(
      EMPLOYEE_SELECT,
    )
    .single();

  if (error) {
    throw new Error(`RH criar funcionário: ${error.message}`);
  }
  return rowToEmployee(data as Row);
}

export async function updateEmployee(
  id: string,
  body: EmployeeUpdateBody,
): Promise<HrEmployee> {
  const supabase = requireHr();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.fullName !== undefined) patch.full_name = body.fullName.trim();
  if (body.email !== undefined) patch.email = body.email?.trim() || null;
  if (body.phone !== undefined) patch.phone = body.phone?.trim() || null;
  if (body.roleOrNotes !== undefined) {
    patch.role_or_notes = body.roleOrNotes?.trim() || null;
  }
  if (body.employmentType !== undefined) {
    patch.employment_type = body.employmentType;
  }
  if (body.jobRole !== undefined) {
    patch.job_role = body.jobRole;
  }
  if (body.weeklySchedule !== undefined) {
    if (body.weeklySchedule === null) {
      patch.weekly_schedule = null;
    } else {
      patch.weekly_schedule = finalizeWeeklySchedule(
        body.weeklySchedule as WeeklySchedule,
      );
    }
  }
  if (body.status !== undefined) patch.status = body.status;
  if (body.hiredAt !== undefined) patch.hired_at = body.hiredAt;
  if (body.endedAt !== undefined) patch.ended_at = body.endedAt;
  if ("baseSalary" in body) patch.base_salary = body.baseSalary ?? null;
  if (body.salaryType !== undefined) patch.salary_type = body.salaryType;
  if ("hourlyRate" in body) patch.hourly_rate = body.hourlyRate ?? null;

  const { data, error } = await supabase
    .from("hr_employees")
    .update(patch)
    .eq("id", id)
    .select(
      EMPLOYEE_SELECT,
    )
    .single();

  if (error) {
    throw new Error(`RH atualizar funcionário: ${error.message}`);
  }
  return rowToEmployee(data as Row);
}

/**
 * Define ou actualiza o PIN de kiosk de um funcionário.
 * Falha com erro descritivo se o PIN já estiver em uso por outro funcionário.
 */
export async function setKioskPin(
  id: string,
  pinHash: string,
): Promise<HrEmployee> {
  const existing = await getEmployee(id);
  if (!existing) {
    throw new Error("Funcionário não encontrado");
  }
  const supabase = requireHr();
  const { data, error } = await supabase
    .from("hr_employees")
    .update({ kiosk_pin_hash: pinHash, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(EMPLOYEE_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Este PIN já está em uso por outro funcionário");
    }
    throw new Error(`RH kiosk PIN: ${error.message}`);
  }
  return rowToEmployee(data as Row);
}

/** Encontra um funcionário activo pelo hash do PIN. Retorna null se não encontrado. */
export async function findActiveEmployeeByPinHash(
  pinHash: string,
): Promise<HrEmployee | null> {
  const supabase = requireHr();
  const { data, error } = await supabase
    .from("hr_employees")
    .select(EMPLOYEE_SELECT)
    .eq("kiosk_pin_hash", pinHash)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`RH kiosk lookup: ${error.message}`);
  }
  if (!data) return null;
  return rowToEmployee(data as Row);
}

export type ExpiringContract = HrEmployee & { daysRemaining: number };

/** Funcionários ativos com contrato a terminar nos próximos `withinDays` dias. */
export async function listExpiringContracts(
  withinDays = 30,
): Promise<ExpiringContract[]> {
  const supabase = requireHr();
  const now = new Date();
  const future = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("hr_employees")
    .select(EMPLOYEE_SELECT)
    .eq("status", "active")
    .not("ended_at", "is", null)
    .gte("ended_at", now.toISOString())
    .lte("ended_at", future.toISOString())
    .order("ended_at", { ascending: true });
  if (error) throw new Error(`RH contratos a expirar: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => {
    const emp = rowToEmployee(row);
    const endMs = new Date(row.ended_at!).getTime();
    const daysRemaining = Math.ceil((endMs - now.getTime()) / (1000 * 60 * 60 * 24));
    return { ...emp, daysRemaining };
  });
}

/** Soft delete: marca inativo e data de fim. */
export async function softDeleteEmployee(id: string): Promise<HrEmployee> {
  const existing = await getEmployee(id);
  if (!existing) {
    throw new Error("Funcionário não encontrado");
  }
  const supabase = requireHr();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("hr_employees")
    .update({
      status: "inactive",
      ended_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select(
      EMPLOYEE_SELECT,
    )
    .single();

  if (error) {
    throw new Error(`RH desativar funcionário: ${error.message}`);
  }
  return rowToEmployee(data as Row);
}
