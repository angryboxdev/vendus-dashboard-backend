import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Closure, ExportJob, PayPeriod, Reopening } from "../../domain/entities/period.js";
import type { PeriodsRepositoryPort } from "../../domain/ports/out/periods.ports.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const iso = (v: unknown) => new Date(String(v)).toISOString();

const PER = "id, scope_type, scope_id, start_date, end_date, status";
const CLO = "id, period_id, closure_no, closed_by, exception_reason, exceptions, totals, diff, created_at";
const REO = "id, period_id, requested_by, requested_by_user_id, reason, approvals, status";
const EXP = "id, period_id, kind, requested_by, requested_by_user_id, include_sensitive, status, error, file_name, totals, expires_at, created_at";

const toPer = (r: Row): PayPeriod => ({ id: String(r.id), scopeType: r.scope_type as PayPeriod["scopeType"], scopeId: str(r.scope_id), startDate: String(r.start_date), endDate: String(r.end_date), status: r.status as PayPeriod["status"] });
const toClo = (r: Row): Closure => ({
  id: String(r.id),
  periodId: String(r.period_id),
  closureNo: Number(r.closure_no),
  closedBy: String(r.closed_by),
  exceptionReason: str(r.exception_reason),
  exceptions: (Array.isArray(r.exceptions) ? r.exceptions : []) as Closure["exceptions"],
  totals: (Array.isArray(r.totals) ? r.totals : []) as Closure["totals"],
  diff: (Array.isArray(r.diff) ? r.diff : null) as Closure["diff"],
  createdAt: iso(r.created_at),
});
const toReo = (r: Row): Reopening => ({
  id: String(r.id),
  periodId: String(r.period_id),
  requestedBy: String(r.requested_by),
  requestedByUserId: String(r.requested_by_user_id),
  reason: String(r.reason),
  approvals: (Array.isArray(r.approvals) ? r.approvals : []) as Reopening["approvals"],
  status: r.status as Reopening["status"],
});
const toExp = (r: Row): ExportJob => ({
  id: String(r.id),
  periodId: String(r.period_id),
  kind: r.kind as ExportJob["kind"],
  requestedBy: String(r.requested_by),
  requestedByUserId: String(r.requested_by_user_id),
  includeSensitive: r.include_sensitive === true,
  status: r.status as ExportJob["status"],
  error: str(r.error),
  fileName: str(r.file_name),
  totals: (r.totals ?? null) as ExportJob["totals"],
  expiresAt: r.expires_at ? iso(r.expires_at) : null,
  createdAt: iso(r.created_at),
});

export class SupabasePeriodsRepository implements PeriodsRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async listPeriods(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("pay_periods").select(PER).order("start_date", { ascending: false })).map(toPer);
  }
  async createPeriod(org: OrganizationId, p: Omit<PayPeriod, "id" | "status">, by: string) {
    return toPer(check(await this.scoped(org).table("pay_periods").insert({ scope_type: p.scopeType, scope_id: p.scopeId, start_date: p.startDate, end_date: p.endDate, created_by: by }).select(PER).single()));
  }
  async setStatus(org: OrganizationId, id: string, expected: PayPeriod["status"][], status: PayPeriod["status"]) {
    const rows = check<Row[]>(await this.scoped(org).table("pay_periods").update({ status }).eq("id", id).in("status", expected).select("id"));
    return rows.length === 1;
  }
  async listClosures(org: OrganizationId, periodId: string) {
    return check<Row[]>(await this.scoped(org).table("pay_period_closures").select(CLO).eq("period_id", periodId).order("closure_no")).map(toClo);
  }
  async insertClosure(org: OrganizationId, c: Omit<Closure, "id" | "createdAt">) {
    const row = { period_id: c.periodId, closure_no: c.closureNo, closed_by: c.closedBy, exception_reason: c.exceptionReason, exceptions: c.exceptions, totals: c.totals, diff: c.diff };
    return toClo(check(await this.scoped(org).table("pay_period_closures").insert(row).select(CLO).single()));
  }
  async listReopenings(org: OrganizationId, periodId?: string) {
    let q = this.scoped(org).table("pay_period_reopenings").select(REO);
    if (periodId) q = q.eq("period_id", periodId);
    return check<Row[]>(await q.order("created_at", { ascending: false })).map(toReo);
  }
  async getReopening(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("pay_period_reopenings").select(REO).eq("id", id).maybeSingle());
    return r ? toReo(r) : null;
  }
  async insertReopening(org: OrganizationId, r: Omit<Reopening, "id" | "approvals" | "status">) {
    const row = { period_id: r.periodId, requested_by: r.requestedBy, requested_by_user_id: r.requestedByUserId, reason: r.reason };
    return toReo(check(await this.scoped(org).table("pay_period_reopenings").insert(row).select(REO).single()));
  }
  async updateReopening(org: OrganizationId, id: string, expectedApprovals: number, patch: Pick<Reopening, "approvals" | "status">) {
    // Concorrência: só aplica se o número de aprovações ainda for o esperado.
    const cur = await this.getReopening(org, id);
    if (!cur || cur.status !== "pending" || cur.approvals.length !== expectedApprovals) return null;
    const row: Row = { approvals: patch.approvals, status: patch.status };
    if (patch.status !== "pending") row.decided_at = new Date().toISOString();
    const rows = check<Row[]>(await this.scoped(org).table("pay_period_reopenings").update(row).eq("id", id).eq("status", "pending").select(REO));
    return rows[0] ? toReo(rows[0]) : null;
  }
  async insertExport(org: OrganizationId, j: Pick<ExportJob, "periodId" | "kind" | "requestedBy" | "requestedByUserId" | "includeSensitive">) {
    const row = { period_id: j.periodId, kind: j.kind, requested_by: j.requestedBy, requested_by_user_id: j.requestedByUserId, include_sensitive: j.includeSensitive };
    return toExp(check(await this.scoped(org).table("export_jobs").insert(row).select(EXP).single()));
  }
  async updateExport(org: OrganizationId, id: string, patch: Partial<Pick<ExportJob, "status" | "error" | "fileName" | "totals" | "expiresAt">> & { content?: string; token?: string }) {
    const row: Row = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.error !== undefined) row.error = patch.error;
    if (patch.fileName !== undefined) row.file_name = patch.fileName;
    if (patch.totals !== undefined) row.totals = patch.totals;
    if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;
    if (patch.content !== undefined) row.content = patch.content;
    if (patch.token !== undefined) row.token = patch.token;
    if (patch.status === "done" || patch.status === "failed") row.finished_at = new Date().toISOString();
    check(await this.scoped(org).table("export_jobs").update(row).eq("id", id));
  }
  async listExports(org: OrganizationId, userId: string) {
    return check<Row[]>(await this.scoped(org).table("export_jobs").select(EXP).eq("requested_by_user_id", userId).order("created_at", { ascending: false }).limit(50)).map(toExp);
  }
  async getExportFile(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("export_jobs").select(`${EXP}, content, token`).eq("id", id).maybeSingle());
    return r ? { job: toExp(r), content: str(r.content), token: str(r.token) } : null;
  }
}

/** Nome do centro (para a faturação por centro). */
export async function locationName(scoped: ScopedQueryFactory, org: OrganizationId, id: string | null): Promise<string> {
  if (!id) return "Sem centro";
  const r = check<Row | null>(await scoped(org).table("locations").select("name").eq("id", id).maybeSingle());
  return r?.name ? String(r.name) : "—";
}
