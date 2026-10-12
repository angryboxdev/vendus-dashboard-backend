import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CustomRequest, OpsTask, RequestForm, RequestFormInput } from "../../domain/entities/workspace.js";
import type { WorkspaceRepositoryPort } from "../../domain/ports/out/workspace.ports.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

const TASK = "id, title, description, assignee_employee_id, location_id, due_at, checklist, status, completed_by, completed_at, created_at";
const FORM = "id, title, response_days, fields, archived";
const REQ = "id, form_id, employee_id, requested_by_user_id, answers, status, due_at, decided_by, decided_at, decision_comment, created_at";

const toTask = (r: Row): OpsTask => ({
  id: String(r.id),
  title: String(r.title),
  description: str(r.description),
  assigneeEmployeeId: str(r.assignee_employee_id),
  locationId: str(r.location_id),
  dueAt: iso(r.due_at),
  checklist: (Array.isArray(r.checklist) ? r.checklist : []) as OpsTask["checklist"],
  status: r.status as OpsTask["status"],
  completedBy: str(r.completed_by),
  completedAt: iso(r.completed_at),
  createdAt: iso(r.created_at)!,
});
const toForm = (r: Row): RequestForm => ({ id: String(r.id), title: String(r.title), responseDays: r.response_days === null || r.response_days === undefined ? null : Number(r.response_days), fields: (Array.isArray(r.fields) ? r.fields : []) as RequestForm["fields"], archived: r.archived === true });
const toReq = (r: Row): CustomRequest => ({
  id: String(r.id),
  formId: String(r.form_id),
  employeeId: String(r.employee_id),
  requestedByUserId: String(r.requested_by_user_id),
  answers: (r.answers ?? {}) as CustomRequest["answers"],
  status: r.status as CustomRequest["status"],
  dueAt: iso(r.due_at),
  decidedBy: str(r.decided_by),
  decidedAt: iso(r.decided_at),
  decisionComment: str(r.decision_comment),
  createdAt: iso(r.created_at)!,
});

export class SupabaseWorkspaceRepository implements WorkspaceRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async listTasks(org: OrganizationId, f: { status?: OpsTask["status"]; assigneeEmployeeId?: string }) {
    let q = this.scoped(org).table("ops_tasks").select(TASK);
    if (f.status) q = q.eq("status", f.status);
    if (f.assigneeEmployeeId) q = q.eq("assignee_employee_id", f.assigneeEmployeeId);
    return check<Row[]>(await q.order("due_at", { ascending: true, nullsFirst: false }).limit(500)).map(toTask);
  }
  async getTask(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("ops_tasks").select(TASK).eq("id", id).maybeSingle());
    return r ? toTask(r) : null;
  }
  async createTask(org: OrganizationId, t: Omit<OpsTask, "id" | "status" | "completedBy" | "completedAt" | "createdAt">, by: string) {
    const row = { title: t.title, description: t.description, assignee_employee_id: t.assigneeEmployeeId, location_id: t.locationId, due_at: t.dueAt, checklist: t.checklist, created_by: by };
    return toTask(check(await this.scoped(org).table("ops_tasks").insert(row).select(TASK).single()));
  }
  async updateTask(org: OrganizationId, id: string, expected: OpsTask["status"], p: Partial<Pick<OpsTask, "checklist" | "status" | "completedBy" | "completedAt">>) {
    const row: Row = {};
    if (p.checklist !== undefined) row.checklist = p.checklist;
    if (p.status !== undefined) row.status = p.status;
    if (p.completedBy !== undefined) row.completed_by = p.completedBy;
    if (p.completedAt !== undefined) row.completed_at = p.completedAt;
    const rows = check<Row[]>(await this.scoped(org).table("ops_tasks").update(row).eq("id", id).eq("status", expected).select(TASK));
    return rows[0] ? toTask(rows[0]) : null;
  }

  async listForms(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("custom_request_forms").select(FORM).order("title")).map(toForm);
  }
  async createForm(org: OrganizationId, f: RequestFormInput, by: string) {
    return toForm(check(await this.scoped(org).table("custom_request_forms").insert({ title: f.title, response_days: f.responseDays, fields: f.fields, created_by: by }).select(FORM).single()));
  }
  async archiveForm(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("custom_request_forms").update({ archived: true }).eq("id", id));
  }
  async listRequests(org: OrganizationId, f: { status?: CustomRequest["status"]; employeeId?: string }) {
    let q = this.scoped(org).table("custom_requests").select(REQ);
    if (f.status) q = q.eq("status", f.status);
    if (f.employeeId) q = q.eq("employee_id", f.employeeId);
    return check<Row[]>(await q.order("created_at", { ascending: false }).limit(500)).map(toReq);
  }
  async getRequest(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("custom_requests").select(REQ).eq("id", id).maybeSingle());
    return r ? toReq(r) : null;
  }
  async createRequest(org: OrganizationId, r: Omit<CustomRequest, "id" | "status" | "decidedBy" | "decidedAt" | "decisionComment" | "createdAt">) {
    const row = { form_id: r.formId, employee_id: r.employeeId, requested_by_user_id: r.requestedByUserId, answers: r.answers, due_at: r.dueAt };
    return toReq(check(await this.scoped(org).table("custom_requests").insert(row).select(REQ).single()));
  }
  async decideRequest(org: OrganizationId, id: string, d: { status: "approved" | "rejected"; decidedBy: string; comment: string | null }) {
    const rows = check<Row[]>(await this.scoped(org).table("custom_requests").update({ status: d.status, decided_by: d.decidedBy, decided_at: new Date().toISOString(), decision_comment: d.comment }).eq("id", id).eq("status", "pending").select(REQ));
    return rows[0] ? toReq(rows[0]) : null;
  }
}
