import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ClockEvent, ClockRevision } from "../../domain/entities/clock.js";
import type { Adjustment, CorrectionRequest, DayVersion, Incident, IncidentStatus } from "../../domain/entities/records.js";
import type { AttendanceRepositoryPort } from "../../domain/ports/out/attendance.ports.js";
import type { IncidentType } from "../../domain/services/day-engine.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string; code?: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown) => new Date(String(v)).toISOString();
const optIso = (v: unknown) => (v === null || v === undefined ? null : iso(v));

const EV = "id, employee_id, occurred_at, segment_type, source, client_event_id, location_id, latitude, longitude, ip";
const REV = "id, employee_id, operation, target_event_id, occurred_at, segment_type, anchor_at, reason, author, state, refusable_until, created_at";
const COR = "id, employee_id, requested_by, operation, target_event_id, occurred_at, segment_type, reason, status, decided_by, decided_at, decision_comment, revision_id, created_at";
const DAY = "employee_id, work_date, version, worked_seconds, break_seconds, night_seconds, theoretical_seconds, excess_seconds, pending_seconds, config_hash, calculated_at";
const ADJ = "id, employee_id, work_date, from_version, to_version, delta_excess_seconds, reason, created_at";
const INC = "id, employee_id, work_date, type, source, status, comment, resolved_by, resolved_at";

const toEvent = (r: Row): ClockEvent => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  occurredAt: iso(r.occurred_at),
  segmentType: r.segment_type as ClockEvent["segmentType"],
  source: r.source as ClockEvent["source"],
  clientEventId: str(r.client_event_id),
  locationId: str(r.location_id),
  latitude: num(r.latitude),
  longitude: num(r.longitude),
  ip: str(r.ip),
});
const toRevision = (r: Row): ClockRevision => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  operation: r.operation as ClockRevision["operation"],
  targetEventId: str(r.target_event_id),
  occurredAt: optIso(r.occurred_at),
  segmentType: (r.segment_type ?? null) as ClockRevision["segmentType"],
  anchorAt: iso(r.anchor_at),
  reason: String(r.reason),
  author: String(r.author),
  state: r.state as ClockRevision["state"],
  refusableUntil: optIso(r.refusable_until),
  createdAt: iso(r.created_at),
});
const toCorrection = (r: Row): CorrectionRequest => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  requestedBy: String(r.requested_by),
  operation: r.operation as CorrectionRequest["operation"],
  targetEventId: str(r.target_event_id),
  occurredAt: optIso(r.occurred_at),
  segmentType: (r.segment_type ?? null) as CorrectionRequest["segmentType"],
  reason: String(r.reason),
  status: r.status as CorrectionRequest["status"],
  decidedBy: str(r.decided_by),
  decidedAt: optIso(r.decided_at),
  decisionComment: str(r.decision_comment),
  revisionId: str(r.revision_id),
  createdAt: iso(r.created_at),
});
const toDay = (r: Row): DayVersion => ({
  employeeId: String(r.employee_id),
  workDate: String(r.work_date),
  version: Number(r.version),
  workedSeconds: Number(r.worked_seconds),
  breakSeconds: Number(r.break_seconds),
  nightSeconds: Number(r.night_seconds),
  theoreticalSeconds: Number(r.theoretical_seconds),
  excessSeconds: Number(r.excess_seconds),
  pendingSeconds: Number(r.pending_seconds),
  configHash: String(r.config_hash),
  calculatedAt: iso(r.calculated_at),
});
const toAdjustment = (r: Row): Adjustment => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  workDate: String(r.work_date),
  fromVersion: Number(r.from_version),
  toVersion: Number(r.to_version),
  deltaExcessSeconds: Number(r.delta_excess_seconds),
  reason: String(r.reason),
  createdAt: iso(r.created_at),
});
const toIncident = (r: Row): Incident => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  workDate: String(r.work_date),
  type: r.type as IncidentType,
  source: String(r.source),
  status: r.status as IncidentStatus,
  comment: str(r.comment),
  resolvedBy: str(r.resolved_by),
  resolvedAt: optIso(r.resolved_at),
});

export class SupabaseAttendanceRepository implements AttendanceRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async insertEvent(org: OrganizationId, e: Omit<ClockEvent, "id">) {
    const row = {
      employee_id: e.employeeId,
      occurred_at: e.occurredAt,
      segment_type: e.segmentType,
      source: e.source,
      client_event_id: e.clientEventId,
      location_id: e.locationId,
      latitude: e.latitude,
      longitude: e.longitude,
      ip: e.ip,
    };
    const res = (await this.scoped(org).table("clock_events").insert(row).select(EV).single()) as Res;
    // RE-9: corrida entre duas tentativas com o mesmo clientEventId → devolve a gravada.
    if (res.error?.code === "23505" && e.clientEventId) {
      const existing = await this.findEventByClientId(org, e.employeeId, e.clientEventId);
      if (existing) return { event: existing, duplicate: true };
    }
    return { event: toEvent(check(res)), duplicate: false };
  }
  async findEventByClientId(org: OrganizationId, employeeId: string, clientEventId: string) {
    const r = check<Row | null>(await this.scoped(org).table("clock_events").select(EV).eq("employee_id", employeeId).eq("client_event_id", clientEventId).maybeSingle());
    return r ? toEvent(r) : null;
  }
  async getEvent(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("clock_events").select(EV).eq("id", id).maybeSingle());
    return r ? toEvent(r) : null;
  }
  async listEvents(org: OrganizationId, employeeId: string, fromUtc: string, toUtc: string) {
    const q = this.scoped(org).table("clock_events").select(EV).eq("employee_id", employeeId).gte("occurred_at", fromUtc).lt("occurred_at", toUtc);
    return check<Row[]>(await q.order("occurred_at")).map(toEvent);
  }

  async insertRevision(org: OrganizationId, r: Omit<ClockRevision, "id" | "createdAt"> & { before: unknown }) {
    const row = {
      employee_id: r.employeeId,
      operation: r.operation,
      target_event_id: r.targetEventId,
      occurred_at: r.occurredAt,
      segment_type: r.segmentType,
      before: r.before ?? null,
      anchor_at: r.anchorAt,
      reason: r.reason,
      author: r.author,
      state: r.state,
      refusable_until: r.refusableUntil,
    };
    return toRevision(check(await this.scoped(org).table("clock_revisions").insert(row).select(REV).single()));
  }
  async getRevision(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("clock_revisions").select(REV).eq("id", id).maybeSingle());
    return r ? toRevision(r) : null;
  }
  async listRevisions(org: OrganizationId, employeeId: string, fromUtc: string, toUtc: string) {
    const q = this.scoped(org).table("clock_revisions").select(REV).eq("employee_id", employeeId).gte("anchor_at", fromUtc).lt("anchor_at", toUtc);
    return check<Row[]>(await q.order("created_at")).map(toRevision);
  }
  async refuseRevision(org: OrganizationId, id: string, comment: string | null) {
    const patch = { state: "refused", refused_at: new Date().toISOString(), refusal_comment: comment };
    return toRevision(check(await this.scoped(org).table("clock_revisions").update(patch).eq("id", id).eq("state", "active").select(REV).single()));
  }

  async listRefusableRevisions(org: OrganizationId, employeeId: string, now: string) {
    const q = this.scoped(org).table("clock_revisions").select(REV).eq("employee_id", employeeId).eq("state", "active").gte("refusable_until", now);
    return check<Row[]>(await q.order("created_at")).map(toRevision);
  }

  async insertCorrection(org: OrganizationId, c: Parameters<AttendanceRepositoryPort["insertCorrection"]>[1]) {
    const row = {
      employee_id: c.employeeId,
      requested_by: c.requestedBy,
      operation: c.operation,
      target_event_id: c.targetEventId,
      occurred_at: c.occurredAt,
      segment_type: c.segmentType,
      reason: c.reason,
    };
    return toCorrection(check(await this.scoped(org).table("clock_correction_requests").insert(row).select(COR).single()));
  }
  async getCorrection(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("clock_correction_requests").select(COR).eq("id", id).maybeSingle());
    return r ? toCorrection(r) : null;
  }
  async listCorrections(org: OrganizationId, f: { status?: CorrectionRequest["status"]; employeeId?: string }) {
    let q = this.scoped(org).table("clock_correction_requests").select(COR);
    if (f.status) q = q.eq("status", f.status);
    if (f.employeeId) q = q.eq("employee_id", f.employeeId);
    return check<Row[]>(await q.order("created_at", { ascending: false }).limit(500)).map(toCorrection);
  }
  async decideCorrection(org: OrganizationId, id: string, d: { status: "approved" | "rejected"; decidedBy: string; comment: string | null; revisionId: string | null }) {
    const patch = { status: d.status, decided_by: d.decidedBy, decided_at: new Date().toISOString(), decision_comment: d.comment, revision_id: d.revisionId };
    return toCorrection(check(await this.scoped(org).table("clock_correction_requests").update(patch).eq("id", id).eq("status", "pending").select(COR).single()));
  }

  async currentDays(org: OrganizationId, employeeId: string, from: string, to: string) {
    const q = this.scoped(org).table("attendance_days").select(DAY).eq("employee_id", employeeId).eq("current", true).gte("work_date", from).lte("work_date", to);
    return check<Row[]>(await q.order("work_date")).map(toDay);
  }
  async insertDayVersion(org: OrganizationId, d: Omit<DayVersion, "calculatedAt">) {
    check(await this.scoped(org).table("attendance_days").update({ current: false }).eq("employee_id", d.employeeId).eq("work_date", d.workDate).eq("current", true));
    const row = {
      employee_id: d.employeeId,
      work_date: d.workDate,
      version: d.version,
      current: true,
      worked_seconds: d.workedSeconds,
      break_seconds: d.breakSeconds,
      night_seconds: d.nightSeconds,
      theoretical_seconds: d.theoreticalSeconds,
      excess_seconds: d.excessSeconds,
      pending_seconds: d.pendingSeconds,
      config_hash: d.configHash,
    };
    return toDay(check(await this.scoped(org).table("attendance_days").insert(row).select(DAY).single()));
  }
  async insertAdjustment(org: OrganizationId, a: Omit<Adjustment, "id" | "createdAt">) {
    const row = { employee_id: a.employeeId, work_date: a.workDate, from_version: a.fromVersion, to_version: a.toVersion, delta_excess_seconds: a.deltaExcessSeconds, reason: a.reason };
    return toAdjustment(check(await this.scoped(org).table("attendance_adjustments").insert(row).select(ADJ).single()));
  }
  async listAdjustments(org: OrganizationId, employeeId: string, from: string, to: string) {
    const q = this.scoped(org).table("attendance_adjustments").select(ADJ).eq("employee_id", employeeId).gte("work_date", from).lte("work_date", to);
    return check<Row[]>(await q.order("created_at")).map(toAdjustment);
  }

  async ensureIncidents(org: OrganizationId, items: { employeeId: string; workDate: string; type: IncidentType }[]) {
    const rows = items.map((i) => ({ employee_id: i.employeeId, work_date: i.workDate, type: i.type, source: "engine" }));
    check(await this.scoped(org).table("attendance_incidents").upsert(rows, { onConflict: "org_id,employee_id,work_date,type,source", ignoreDuplicates: true }));
  }
  async getIncident(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("attendance_incidents").select(INC).eq("id", id).maybeSingle());
    return r ? toIncident(r) : null;
  }
  async listIncidents(org: OrganizationId, f: { status?: IncidentStatus; employeeId?: string; from: string; to: string }) {
    let q = this.scoped(org).table("attendance_incidents").select(INC).gte("work_date", f.from).lte("work_date", f.to);
    if (f.status) q = q.eq("status", f.status);
    if (f.employeeId) q = q.eq("employee_id", f.employeeId);
    return check<Row[]>(await q.order("work_date").limit(1000)).map(toIncident);
  }
  async resolveIncident(org: OrganizationId, id: string, r: { status: Exclude<IncidentStatus, "open">; comment: string | null; resolvedBy: string }) {
    const patch = { status: r.status, comment: r.comment, resolved_by: r.resolvedBy, resolved_at: new Date().toISOString() };
    return toIncident(check(await this.scoped(org).table("attendance_incidents").update(patch).eq("id", id).eq("status", "open").select(INC).single()));
  }

  async enqueue(org: OrganizationId, employeeId: string, dates: string[]) {
    const rows = dates.map((d) => ({ employee_id: employeeId, work_date: d }));
    check(await this.scoped(org).table("attendance_recalc_queue").upsert(rows, { onConflict: "org_id,employee_id,work_date", ignoreDuplicates: true }));
  }
  async takeQueue(org: OrganizationId, limit: number) {
    const rows = check<Row[]>(await this.scoped(org).table("attendance_recalc_queue").select("employee_id, work_date").order("requested_at").limit(limit));
    for (const r of rows) {
      check(await this.scoped(org).table("attendance_recalc_queue").delete().eq("employee_id", String(r.employee_id)).eq("work_date", String(r.work_date)));
    }
    return rows.map((r) => ({ employeeId: String(r.employee_id), workDate: String(r.work_date) }));
  }
}
