import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Publication, Roster, RosterShift, ShiftState, ShiftTemplate, ShiftTemplateInput, Swap, WorkArea } from "../../domain/entities/roster.js";
import type { RostersRepositoryPort } from "../../domain/ports/out/rosters.ports.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

const TPL = "id, name, abbreviation, color, on_call, segments, archived";
const ROS = "id, name, target_type, target_id, version, archived";
const SHF = "id, roster_id, employee_id, work_date, kind, segments, template_id, on_call, area_id, deleted, dirty, published, published_version";
const ARE = "id, location_id, name, sort_order, active";
const toArea = (r: Row): WorkArea => ({ id: String(r.id), locationId: String(r.location_id), name: String(r.name), sortOrder: Number(r.sort_order ?? 0), active: r.active !== false });
const PUB = "id, roster_id, version, reason, confirmed_warnings, changes, published_by, created_at";
const SWP = "id, shift_id, counter_shift_id, requester_employee_id, target_employee_id, status, comment, decided_by, created_at";

const toTpl = (r: Row): ShiftTemplate => ({
  id: String(r.id),
  name: String(r.name),
  abbreviation: String(r.abbreviation),
  color: str(r.color),
  onCall: r.on_call === true,
  segments: (Array.isArray(r.segments) ? r.segments : []) as ShiftTemplate["segments"],
  archived: r.archived === true,
});
const toRos = (r: Row): Roster => ({ id: String(r.id), name: String(r.name), targetType: r.target_type as Roster["targetType"], targetId: String(r.target_id), version: Number(r.version), archived: r.archived === true });
const toShf = (r: Row): RosterShift => ({
  id: String(r.id),
  rosterId: String(r.roster_id),
  employeeId: String(r.employee_id),
  workDate: String(r.work_date),
  kind: r.kind as RosterShift["kind"],
  segments: (Array.isArray(r.segments) ? r.segments : []) as RosterShift["segments"],
  templateId: str(r.template_id),
  onCall: r.on_call === true,
  areaId: str(r.area_id),
  deleted: r.deleted === true,
  dirty: r.dirty === true,
  published: (r.published ?? null) as ShiftState | null,
  publishedVersion: r.published_version === null || r.published_version === undefined ? null : Number(r.published_version),
});
const toPub = (r: Row): Publication => ({
  id: String(r.id),
  rosterId: String(r.roster_id),
  version: Number(r.version),
  reason: str(r.reason),
  confirmedWarnings: (Array.isArray(r.confirmed_warnings) ? r.confirmed_warnings : []) as unknown[],
  changes: (Array.isArray(r.changes) ? r.changes : []) as Publication["changes"],
  publishedBy: String(r.published_by),
  createdAt: new Date(String(r.created_at)).toISOString(),
});
const toSwp = (r: Row): Swap => ({
  id: String(r.id),
  shiftId: String(r.shift_id),
  counterShiftId: str(r.counter_shift_id),
  requesterEmployeeId: String(r.requester_employee_id),
  targetEmployeeId: String(r.target_employee_id),
  status: r.status as Swap["status"],
  comment: str(r.comment),
  decidedBy: str(r.decided_by),
  createdAt: new Date(String(r.created_at)).toISOString(),
});

export class SupabaseRostersRepository implements RostersRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async listTemplates(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("roster_shift_templates").select(TPL).order("name")).map(toTpl);
  }
  async createTemplate(org: OrganizationId, t: ShiftTemplateInput, by: string) {
    const row = { name: t.name, abbreviation: t.abbreviation, color: t.color, on_call: t.onCall, segments: t.segments, created_by: by };
    return toTpl(check(await this.scoped(org).table("roster_shift_templates").insert(row).select(TPL).single()));
  }
  async setTemplateColor(org: OrganizationId, id: string, color: string | null) {
    return toTpl(check(await this.scoped(org).table("roster_shift_templates").update({ color }).eq("id", id).select(TPL).single()));
  }
  async archiveTemplate(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("roster_shift_templates").update({ archived: true }).eq("id", id));
  }

  async listAreas(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("work_areas").select(ARE).order("sort_order").order("name")).map(toArea);
  }
  async createArea(org: OrganizationId, a: { locationId: string; name: string; sortOrder: number }, by: string) {
    return toArea(check(await this.scoped(org).table("work_areas").insert({ location_id: a.locationId, name: a.name, sort_order: a.sortOrder, created_by: by }).select(ARE).single()));
  }
  async updateArea(org: OrganizationId, id: string, patch: Partial<Pick<WorkArea, "name" | "sortOrder" | "active">>) {
    const row: Row = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
    if (patch.active !== undefined) row.active = patch.active;
    return toArea(check(await this.scoped(org).table("work_areas").update(row).eq("id", id).select(ARE).single()));
  }

  async listRosters(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("rosters").select(ROS).order("name")).map(toRos);
  }
  async createRoster(org: OrganizationId, r: Pick<Roster, "name" | "targetType" | "targetId">, by: string) {
    return toRos(check(await this.scoped(org).table("rosters").insert({ name: r.name, target_type: r.targetType, target_id: r.targetId, created_by: by }).select(ROS).single()));
  }
  async archiveRoster(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("rosters").update({ archived: true }).eq("id", id));
  }
  async bumpVersion(org: OrganizationId, id: string, expected: number) {
    const rows = check<Row[]>(await this.scoped(org).table("rosters").update({ version: expected + 1 }).eq("id", id).eq("version", expected).select("id"));
    return rows.length === 1;
  }

  async listShifts(org: OrganizationId, f: { rosterId?: string; employeeIds?: string[]; from: string; to: string; includeDeleted?: boolean }) {
    let q = this.scoped(org).table("roster_shifts").select(SHF).gte("work_date", f.from).lte("work_date", f.to);
    if (f.rosterId) q = q.eq("roster_id", f.rosterId);
    if (f.employeeIds) q = q.in("employee_id", f.employeeIds.length ? f.employeeIds : ["00000000-0000-0000-0000-000000000000"]);
    if (!f.includeDeleted) q = q.eq("deleted", false);
    return check<Row[]>(await q.order("work_date").limit(20000)).map(toShf);
  }
  async getShift(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("roster_shifts").select(SHF).eq("id", id).maybeSingle());
    return r ? toShf(r) : null;
  }
  async clearPending(org: OrganizationId, f: { rosterId: string; employeeId: string; from: string; to: string; ids?: string[] }, by: string) {
    let q = this.scoped(org)
      .table("roster_shifts")
      .update({ deleted: true, dirty: false, updated_by: by, updated_at: new Date().toISOString() })
      .eq("roster_id", f.rosterId)
      .eq("employee_id", f.employeeId)
      .gte("work_date", f.from)
      .lte("work_date", f.to)
      .eq("deleted", false)
      .is("published", null);
    if (f.ids) q = q.in("id", f.ids.length ? f.ids : ["00000000-0000-0000-0000-000000000000"]);
    return check<Row[]>(await q.select(SHF)).map(toShf);
  }
  async restoreShifts(org: OrganizationId, rosterId: string, ids: string[], by: string) {
    if (!ids.length) return [];
    const q = this.scoped(org)
      .table("roster_shifts")
      .update({ deleted: false, dirty: true, updated_by: by, updated_at: new Date().toISOString() })
      .eq("roster_id", rosterId)
      .in("id", ids)
      .eq("deleted", true)
      .is("published", null);
    return check<Row[]>(await q.select(SHF)).map(toShf);
  }
  async insertShifts(org: OrganizationId, rows: (ShiftState & { rosterId: string })[], by: string) {
    if (!rows.length) return [];
    const data = rows.map((r) => ({ roster_id: r.rosterId, employee_id: r.employeeId, work_date: r.workDate, kind: r.kind, segments: r.segments, template_id: r.templateId, on_call: r.onCall, area_id: r.areaId ?? null, updated_by: by }));
    return check<Row[]>(await this.scoped(org).table("roster_shifts").insert(data).select(SHF)).map(toShf);
  }
  async updateShift(
    org: OrganizationId,
    id: string,
    patch: Partial<Pick<RosterShift, "kind" | "segments" | "templateId" | "onCall" | "deleted" | "dirty" | "published" | "publishedVersion" | "employeeId" | "areaId">>,
    by: string,
  ) {
    const row: Row = { updated_by: by, updated_at: new Date().toISOString() };
    if (patch.kind !== undefined) row.kind = patch.kind;
    if (patch.segments !== undefined) row.segments = patch.segments;
    if (patch.templateId !== undefined) row.template_id = patch.templateId;
    if (patch.onCall !== undefined) row.on_call = patch.onCall;
    if (patch.deleted !== undefined) row.deleted = patch.deleted;
    if (patch.dirty !== undefined) row.dirty = patch.dirty;
    if (patch.published !== undefined) row.published = patch.published;
    if (patch.publishedVersion !== undefined) row.published_version = patch.publishedVersion;
    if (patch.employeeId !== undefined) row.employee_id = patch.employeeId;
    if (patch.areaId !== undefined) row.area_id = patch.areaId;
    return toShf(check(await this.scoped(org).table("roster_shifts").update(row).eq("id", id).select(SHF).single()));
  }

  async insertPublication(org: OrganizationId, p: Omit<Publication, "id" | "createdAt">) {
    const row = { roster_id: p.rosterId, version: p.version, reason: p.reason, confirmed_warnings: p.confirmedWarnings, changes: p.changes, published_by: p.publishedBy };
    return toPub(check(await this.scoped(org).table("roster_publications").insert(row).select(PUB).single()));
  }
  async listPublications(org: OrganizationId, rosterId: string) {
    return check<Row[]>(await this.scoped(org).table("roster_publications").select(PUB).eq("roster_id", rosterId).order("version", { ascending: false })).map(toPub);
  }

  async insertSwap(org: OrganizationId, s: Omit<Swap, "id" | "status" | "decidedBy" | "createdAt">) {
    const row = { shift_id: s.shiftId, counter_shift_id: s.counterShiftId, requester_employee_id: s.requesterEmployeeId, target_employee_id: s.targetEmployeeId, comment: s.comment };
    return toSwp(check(await this.scoped(org).table("roster_swaps").insert(row).select(SWP).single()));
  }
  async getSwap(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("roster_swaps").select(SWP).eq("id", id).maybeSingle());
    return r ? toSwp(r) : null;
  }
  async listSwaps(org: OrganizationId, f: { status?: Swap["status"]; employeeId?: string }) {
    let q = this.scoped(org).table("roster_swaps").select(SWP);
    if (f.status) q = q.eq("status", f.status);
    if (f.employeeId) q = q.or(`requester_employee_id.eq.${f.employeeId},target_employee_id.eq.${f.employeeId}`);
    return check<Row[]>(await q.order("created_at", { ascending: false }).limit(500)).map(toSwp);
  }
  async updateSwap(org: OrganizationId, id: string, expected: Swap["status"], patch: { status: Swap["status"]; decidedBy?: string; comment?: string | null }) {
    const row: Row = { status: patch.status };
    if (patch.decidedBy !== undefined) {
      row.decided_by = patch.decidedBy;
      row.decided_at = new Date().toISOString();
    }
    if (patch.comment !== undefined) row.comment = patch.comment;
    const rows = check<Row[]>(await this.scoped(org).table("roster_swaps").update(row).eq("id", id).eq("status", expected).select(SWP));
    return rows[0] ? toSwp(rows[0]) : null;
  }
}
