import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { Absence, type AbsenceProps } from "../../domain/entities/absence.js";
import type { AbsenceRepositoryPort, LeaveBalanceRecord } from "../../domain/ports/out/absence-repository.port.js";
import type { LeaveType } from "../../domain/ports/out/leave-read.port.js";

const SELECT =
  "id, employee_id, type, status, start_date, end_date, start_time, end_time, minutes, working_days, notes, source, portal_request_id, created_by, created_at, cancelled_at, cancelled_by, cancel_reason";

interface Row {
  id: string;
  employee_id: string;
  type: LeaveType;
  status: AbsenceProps["status"] | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  minutes: number | null;
  working_days: number | null;
  notes: string | null;
  source: AbsenceProps["source"] | null;
  portal_request_id: string | null;
  created_by: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
}

const hm = (t: string | null) => (t ? t.slice(0, 5) : null);

function toEntity(r: Row): Absence {
  return Absence.reconstitute({
    id: r.id,
    employeeId: r.employee_id,
    type: r.type,
    status: r.status ?? "active",
    startDate: r.start_date,
    endDate: r.end_date,
    startTime: hm(r.start_time),
    endTime: hm(r.end_time),
    minutes: r.minutes,
    workingDays: r.working_days ?? 0,
    notes: r.notes,
    source: r.source ?? "hr",
    portalRequestId: r.portal_request_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    cancelledAt: r.cancelled_at,
    cancelledBy: r.cancelled_by,
    cancelReason: r.cancel_reason,
  });
}

function toRow(p: AbsenceProps): Record<string, unknown> {
  return {
    id: p.id,
    employee_id: p.employeeId,
    type: p.type,
    status: p.status,
    start_date: p.startDate,
    end_date: p.endDate,
    start_time: p.startTime,
    end_time: p.endTime,
    minutes: p.minutes,
    working_days: p.workingDays,
    notes: p.notes,
    source: p.source,
    portal_request_id: p.portalRequestId,
    created_by: p.createdBy,
    cancelled_at: p.cancelledAt,
    cancelled_by: p.cancelledBy,
    cancel_reason: p.cancelReason,
  };
}

/** Férias & Ausências 2.0 sobre `hr_leave_requests` (mesma tabela do legacy; nunca DELETE). */
export class SupabaseAbsenceRepository implements AbsenceRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findInRange(organizationId: OrganizationId, from: string, to: string): Promise<Absence[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_leave_requests")
      .select(SELECT)
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toEntity);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<Absence | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_leave_requests").select(SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as Row) : null;
  }

  async findActiveForEmployee(organizationId: OrganizationId, employeeId: string, from: string, to: string): Promise<Absence[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_leave_requests")
      .select(SELECT)
      .eq("employee_id", employeeId)
      .eq("status", "active")
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toEntity);
  }

  async create(organizationId: OrganizationId, absence: Absence): Promise<Absence> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_leave_requests").insert(toRow(absence.toProps())).select(SELECT).single();
    if (error) throw new Error(error.message);
    return toEntity(data as unknown as Row);
  }

  async update(organizationId: OrganizationId, absence: Absence): Promise<Absence> {
    const { id, ...patch } = toRow(absence.toProps());
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_leave_requests")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id as string)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return toEntity(data as unknown as Row);
  }

  async findBalance(organizationId: OrganizationId, employeeId: string, year: number): Promise<LeaveBalanceRecord | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_leave_balances")
      .select("days_entitled, days_carried_over")
      .eq("employee_id", employeeId)
      .eq("year", year)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const r = data as unknown as { days_entitled: number; days_carried_over: number | null };
    return { daysEntitled: r.days_entitled, daysCarriedOver: r.days_carried_over ?? 0 };
  }

  async findBalances(organizationId: OrganizationId, year: number): Promise<Map<string, LeaveBalanceRecord>> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_leave_balances").select("employee_id, days_entitled, days_carried_over").eq("year", year);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<{ employee_id: string; days_entitled: number; days_carried_over: number | null }>;
    return new Map(rows.map((r) => [r.employee_id, { daysEntitled: r.days_entitled, daysCarriedOver: r.days_carried_over ?? 0 }]));
  }

  async saveBalance(organizationId: OrganizationId, employeeId: string, year: number, b: LeaveBalanceRecord): Promise<void> {
    const q = this.scopedQuery(organizationId).table("hr_leave_balances");
    const { data: existing, error: readError } = await q.select("id").eq("employee_id", employeeId).eq("year", year).maybeSingle();
    if (readError) throw new Error(readError.message);
    const values = { days_entitled: b.daysEntitled, days_carried_over: b.daysCarriedOver, updated_at: new Date().toISOString() };
    const { error } = existing
      ? await this.scopedQuery(organizationId).table("hr_leave_balances").update(values).eq("id", (existing as unknown as { id: string }).id)
      : await this.scopedQuery(organizationId).table("hr_leave_balances").insert({ employee_id: employeeId, year, ...values });
    if (error) throw new Error(error.message);
  }
}
