import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AbsenceType, AbsenceTypeInput } from "../../domain/entities/absence-type.js";
import type { ApprovalFlow, ApprovalFlowInput } from "../../domain/entities/approval-flow.js";
import type { AbsenceRequest, ApprovalDecision, LedgerEntry, RequestStatus } from "../../domain/entities/request.js";
import type { AbsencesRepositoryPort } from "../../domain/ports/out/absences.ports.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string; code?: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown) => new Date(String(v)).toISOString();
const hhmm = (v: unknown) => (v === null || v === undefined ? null : String(v).slice(0, 5));

const TYPE =
  "id, name, code, color, category, unit, counting, limit_amount, renewal, allow_negative, carry_over, requires_approval, private, hidden_from_employee, attachment, time_impact, intersect_schedule, half_day, min_consecutive, max_consecutive, blocked_dates, paid, flow_id, archived";
const FLOW = "id, name, scope, is_default, levels, fallback_user_ids, archived";
const REQ =
  "id, employee_id, type_id, kind, start_date, end_date, start_time, end_time, half_day, amount, unit, period, status, comment, attachment_document_id, requested_by, requested_by_user_id, levels, current_level, decided_at, cancel_reason, created_at";
const DEC = "id, request_id, level, actor, actor_user_id, decision, comment, created_at";
const ENT = "id, employee_id, type_id, period, kind, amount, unit, request_id, reference_date, reason, created_by, created_at";

const toType = (r: Row): AbsenceType => ({
  id: String(r.id),
  name: String(r.name),
  code: str(r.code),
  color: str(r.color),
  category: r.category as AbsenceType["category"],
  unit: r.unit as AbsenceType["unit"],
  counting: r.counting as AbsenceType["counting"],
  limitAmount: num(r.limit_amount),
  renewal: r.renewal as AbsenceType["renewal"],
  allowNegative: r.allow_negative === true,
  carryOver: r.carry_over === true,
  requiresApproval: r.requires_approval === true,
  private: r.private === true,
  hiddenFromEmployee: r.hidden_from_employee === true,
  attachment: r.attachment as AbsenceType["attachment"],
  timeImpact: r.time_impact as AbsenceType["timeImpact"],
  intersectSchedule: r.intersect_schedule === true,
  halfDay: r.half_day === true,
  minConsecutive: num(r.min_consecutive),
  maxConsecutive: num(r.max_consecutive),
  blockedDates: Array.isArray(r.blocked_dates) ? (r.blocked_dates as unknown[]).map(String) : [],
  paid: r.paid === true,
  flowId: str(r.flow_id),
  archived: r.archived === true,
});
const typeRow = (t: AbsenceTypeInput): Row => ({
  name: t.name,
  code: t.code,
  color: t.color,
  category: t.category,
  unit: t.unit,
  counting: t.counting,
  limit_amount: t.limitAmount,
  renewal: t.renewal,
  allow_negative: t.allowNegative,
  carry_over: t.carryOver,
  requires_approval: t.requiresApproval,
  private: t.private,
  hidden_from_employee: t.hiddenFromEmployee,
  attachment: t.attachment,
  time_impact: t.timeImpact,
  intersect_schedule: t.intersectSchedule,
  half_day: t.halfDay,
  min_consecutive: t.minConsecutive,
  max_consecutive: t.maxConsecutive,
  blocked_dates: t.blockedDates,
  paid: t.paid,
  flow_id: t.flowId,
});
const toFlow = (r: Row): ApprovalFlow => ({
  id: String(r.id),
  name: String(r.name),
  scope: r.scope as ApprovalFlow["scope"],
  isDefault: r.is_default === true,
  levels: (Array.isArray(r.levels) ? r.levels : []) as ApprovalFlow["levels"],
  fallbackUserIds: Array.isArray(r.fallback_user_ids) ? (r.fallback_user_ids as unknown[]).map(String) : [],
  archived: r.archived === true,
});
const flowRow = (f: ApprovalFlowInput): Row => ({ name: f.name, scope: f.scope, is_default: f.isDefault, levels: f.levels, fallback_user_ids: f.fallbackUserIds });
const toReq = (r: Row): AbsenceRequest => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  typeId: String(r.type_id),
  kind: r.kind as AbsenceRequest["kind"],
  startDate: String(r.start_date),
  endDate: String(r.end_date),
  startTime: hhmm(r.start_time),
  endTime: hhmm(r.end_time),
  halfDay: r.half_day === true,
  amount: Number(r.amount),
  unit: r.unit as AbsenceRequest["unit"],
  period: String(r.period),
  status: r.status as RequestStatus,
  comment: str(r.comment),
  attachmentDocumentId: str(r.attachment_document_id),
  requestedBy: String(r.requested_by),
  requestedByUserId: str(r.requested_by_user_id),
  levels: (Array.isArray(r.levels) ? r.levels : []) as AbsenceRequest["levels"],
  currentLevel: Number(r.current_level),
  decidedAt: r.decided_at ? iso(r.decided_at) : null,
  cancelReason: str(r.cancel_reason),
  createdAt: iso(r.created_at),
});
const toDec = (r: Row): ApprovalDecision => ({
  id: String(r.id),
  requestId: String(r.request_id),
  level: Number(r.level),
  actor: String(r.actor),
  actorUserId: str(r.actor_user_id),
  decision: r.decision as ApprovalDecision["decision"],
  comment: str(r.comment),
  createdAt: iso(r.created_at),
});
const toEnt = (r: Row): LedgerEntry => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  typeId: String(r.type_id),
  period: String(r.period),
  kind: r.kind as LedgerEntry["kind"],
  amount: Number(r.amount),
  unit: r.unit as LedgerEntry["unit"],
  requestId: str(r.request_id),
  referenceDate: str(r.reference_date),
  reason: String(r.reason),
  createdBy: String(r.created_by),
  createdAt: iso(r.created_at),
});

export class SupabaseAbsencesRepository implements AbsencesRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async listTypes(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("absence_types").select(TYPE).order("name")).map(toType);
  }
  async createType(org: OrganizationId, t: AbsenceTypeInput, by: string) {
    return toType(check(await this.scoped(org).table("absence_types").insert({ ...typeRow(t), created_by: by }).select(TYPE).single()));
  }
  async updateType(org: OrganizationId, id: string, t: AbsenceTypeInput) {
    return toType(check(await this.scoped(org).table("absence_types").update(typeRow(t)).eq("id", id).select(TYPE).single()));
  }
  async archiveType(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("absence_types").update({ archived: true }).eq("id", id));
  }

  async listFlows(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("approval_flows").select(FLOW).order("name")).map(toFlow);
  }
  async createFlow(org: OrganizationId, f: ApprovalFlowInput, by: string) {
    if (f.isDefault) await this.clearDefault(org, f.scope, "00000000-0000-0000-0000-000000000000");
    return toFlow(check(await this.scoped(org).table("approval_flows").insert({ ...flowRow(f), created_by: by }).select(FLOW).single()));
  }
  async updateFlow(org: OrganizationId, id: string, f: ApprovalFlowInput) {
    if (f.isDefault) await this.clearDefault(org, f.scope, id);
    return toFlow(check(await this.scoped(org).table("approval_flows").update(flowRow(f)).eq("id", id).select(FLOW).single()));
  }
  async archiveFlow(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("approval_flows").update({ archived: true, is_default: false }).eq("id", id));
  }
  async clearDefault(org: OrganizationId, scope: ApprovalFlow["scope"], exceptId: string) {
    check(await this.scoped(org).table("approval_flows").update({ is_default: false }).eq("scope", scope).eq("is_default", true).neq("id", exceptId));
  }

  async insertRequest(org: OrganizationId, r: Omit<AbsenceRequest, "id" | "createdAt" | "decidedAt" | "cancelReason">) {
    const row = {
      employee_id: r.employeeId,
      type_id: r.typeId,
      kind: r.kind,
      start_date: r.startDate,
      end_date: r.endDate,
      start_time: r.startTime,
      end_time: r.endTime,
      half_day: r.halfDay,
      amount: r.amount,
      unit: r.unit,
      period: r.period,
      status: r.status,
      comment: r.comment,
      attachment_document_id: r.attachmentDocumentId,
      requested_by: r.requestedBy,
      requested_by_user_id: r.requestedByUserId,
      levels: r.levels,
      current_level: r.currentLevel,
      decided_at: r.status === "approved" ? new Date().toISOString() : null,
    };
    return toReq(check(await this.scoped(org).table("absence_requests").insert(row).select(REQ).single()));
  }
  async getRequest(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("absence_requests").select(REQ).eq("id", id).maybeSingle());
    return r ? toReq(r) : null;
  }
  async listRequests(org: OrganizationId, f: { status?: RequestStatus; employeeId?: string; from?: string; to?: string }) {
    let q = this.scoped(org).table("absence_requests").select(REQ);
    if (f.status) q = q.eq("status", f.status);
    if (f.employeeId) q = q.eq("employee_id", f.employeeId);
    if (f.from) q = q.gte("end_date", f.from);
    if (f.to) q = q.lte("start_date", f.to);
    return check<Row[]>(await q.order("start_date", { ascending: false }).limit(1000)).map(toReq);
  }
  async updateRequest(
    org: OrganizationId,
    id: string,
    expected: { status: RequestStatus; currentLevel: number },
    patch: Partial<Pick<AbsenceRequest, "status" | "currentLevel" | "decidedAt" | "cancelReason">>,
  ) {
    const row: Row = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.currentLevel !== undefined) row.current_level = patch.currentLevel;
    if (patch.decidedAt !== undefined) row.decided_at = patch.decidedAt;
    if (patch.cancelReason !== undefined) row.cancel_reason = patch.cancelReason;
    const res = check<Row[]>(await this.scoped(org).table("absence_requests").update(row).eq("id", id).eq("status", expected.status).eq("current_level", expected.currentLevel).select(REQ));
    return res[0] ? toReq(res[0]) : null;
  }

  async insertDecision(org: OrganizationId, d: Omit<ApprovalDecision, "id" | "createdAt">) {
    const row = { request_id: d.requestId, level: d.level, actor: d.actor, actor_user_id: d.actorUserId, decision: d.decision, comment: d.comment };
    return toDec(check(await this.scoped(org).table("approval_decisions").insert(row).select(DEC).single()));
  }
  async listDecisions(org: OrganizationId, requestId: string) {
    return check<Row[]>(await this.scoped(org).table("approval_decisions").select(DEC).eq("request_id", requestId).order("created_at")).map(toDec);
  }

  async insertEntry(org: OrganizationId, e: Omit<LedgerEntry, "id" | "createdAt">) {
    const row = {
      employee_id: e.employeeId,
      type_id: e.typeId,
      period: e.period,
      kind: e.kind,
      amount: e.amount,
      unit: e.unit,
      request_id: e.requestId,
      reference_date: e.referenceDate,
      reason: e.reason,
      created_by: e.createdBy,
    };
    const res = (await this.scoped(org).table("leave_balance_entries").insert(row).select(ENT).single()) as Res;
    // Acumulação/compensação já existente (índice único) → nada a fazer.
    if (res.error?.code === "23505") return null;
    return toEnt(check(res));
  }
  async listEntries(org: OrganizationId, f: { employeeId: string; typeId?: string; period?: string }) {
    let q = this.scoped(org).table("leave_balance_entries").select(ENT).eq("employee_id", f.employeeId);
    if (f.typeId) q = q.eq("type_id", f.typeId);
    if (f.period) q = q.eq("period", f.period);
    return check<Row[]>(await q.order("created_at")).map(toEnt);
  }
}
