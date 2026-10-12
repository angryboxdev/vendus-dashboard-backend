import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Alert, AlertRule, AlertRuleInput } from "../../domain/entities/alert.js";
import type { AlertsRepositoryPort } from "../../domain/ports/out/alerts.ports.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string; code?: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

const RULE = "id, kind, threshold_days, owner, sla_hours, escalate_to, enabled";
const ALERT = "id, rule_id, source_type, source_id, employee_id, title, owner_user_ids, status, due_at, escalated_at, escalated_to, taken_by, closed_by, closed_at, close_note, created_at";

const toRule = (r: Row): AlertRule => ({ id: String(r.id), kind: r.kind as AlertRule["kind"], thresholdDays: Number(r.threshold_days), owner: String(r.owner), slaHours: Number(r.sla_hours), escalateTo: str(r.escalate_to), enabled: r.enabled === true });
const ruleRow = (r: AlertRuleInput): Row => ({ kind: r.kind, threshold_days: r.thresholdDays, owner: r.owner, sla_hours: r.slaHours, escalate_to: r.escalateTo, enabled: r.enabled });
const toAlert = (r: Row): Alert => ({
  id: String(r.id),
  ruleId: String(r.rule_id),
  sourceType: String(r.source_type),
  sourceId: String(r.source_id),
  employeeId: str(r.employee_id),
  title: String(r.title),
  ownerUserIds: Array.isArray(r.owner_user_ids) ? (r.owner_user_ids as unknown[]).map(String) : [],
  status: r.status as Alert["status"],
  dueAt: iso(r.due_at)!,
  escalatedAt: iso(r.escalated_at),
  escalatedTo: Array.isArray(r.escalated_to) ? (r.escalated_to as unknown[]).map(String) : null,
  takenBy: str(r.taken_by),
  closedBy: str(r.closed_by),
  closedAt: iso(r.closed_at),
  closeNote: str(r.close_note),
  createdAt: iso(r.created_at)!,
});

export class SupabaseAlertsRepository implements AlertsRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async listRules(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("alert_rules").select(RULE).order("created_at")).map(toRule);
  }
  async createRule(org: OrganizationId, r: AlertRuleInput, by: string) {
    return toRule(check(await this.scoped(org).table("alert_rules").insert({ ...ruleRow(r), created_by: by }).select(RULE).single()));
  }
  async updateRule(org: OrganizationId, id: string, r: AlertRuleInput) {
    return toRule(check(await this.scoped(org).table("alert_rules").update(ruleRow(r)).eq("id", id).select(RULE).single()));
  }
  async listAlerts(org: OrganizationId, f: { status?: Alert["status"] | "active" }) {
    let q = this.scoped(org).table("alerts").select(ALERT);
    if (f.status === "active") q = q.neq("status", "closed");
    else if (f.status) q = q.eq("status", f.status);
    return check<Row[]>(await q.order("due_at").limit(1000)).map(toAlert);
  }
  async getAlert(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("alerts").select(ALERT).eq("id", id).maybeSingle());
    return r ? toAlert(r) : null;
  }
  async openAlert(org: OrganizationId, a: Pick<Alert, "ruleId" | "sourceType" | "sourceId" | "employeeId" | "title" | "ownerUserIds" | "dueAt">) {
    const row = { rule_id: a.ruleId, source_type: a.sourceType, source_id: a.sourceId, employee_id: a.employeeId, title: a.title, owner_user_ids: a.ownerUserIds, due_at: a.dueAt };
    const res = (await this.scoped(org).table("alerts").insert(row).select(ALERT).single()) as Res;
    // Já há um aberto para esta origem e regra (índice único) → sem duplicados.
    if (res.error?.code === "23505") return null;
    return toAlert(check(res));
  }
  async updateAlert(org: OrganizationId, id: string, expected: Alert["status"][], p: Partial<Pick<Alert, "status" | "escalatedAt" | "escalatedTo" | "ownerUserIds" | "takenBy" | "closedBy" | "closedAt" | "closeNote">>) {
    const row: Row = {};
    if (p.status !== undefined) row.status = p.status;
    if (p.escalatedAt !== undefined) row.escalated_at = p.escalatedAt;
    if (p.escalatedTo !== undefined) row.escalated_to = p.escalatedTo;
    if (p.ownerUserIds !== undefined) row.owner_user_ids = p.ownerUserIds;
    if (p.takenBy !== undefined) row.taken_by = p.takenBy;
    if (p.closedBy !== undefined) row.closed_by = p.closedBy;
    if (p.closedAt !== undefined) row.closed_at = p.closedAt;
    if (p.closeNote !== undefined) row.close_note = p.closeNote;
    const rows = check<Row[]>(await this.scoped(org).table("alerts").update(row).eq("id", id).in("status", expected).select(ALERT));
    return rows[0] ? toAlert(rows[0]) : null;
  }
}
