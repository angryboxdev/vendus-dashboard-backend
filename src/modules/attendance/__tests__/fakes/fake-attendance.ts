import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ClockEvent, ClockRevision } from "../../domain/entities/clock.js";
import type { Adjustment, CorrectionRequest, DayVersion, Incident, IncidentStatus } from "../../domain/entities/records.js";
import type { AttendanceConfig, AttendanceContextPort, AttendanceRepositoryPort, BackgroundPort } from "../../domain/ports/out/attendance.ports.js";
import type { DayPlan, IncidentType } from "../../domain/services/day-engine.js";

let seq = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export class FakeAttendanceRepository implements AttendanceRepositoryPort {
  events: ClockEvent[] = [];
  revisions: (ClockRevision & { before: unknown })[] = [];
  corrections: CorrectionRequest[] = [];
  days: (DayVersion & { current: boolean })[] = [];
  adjustments: Adjustment[] = [];
  incidents: Incident[] = [];
  queue: { employeeId: string; workDate: string }[] = [];
  now = () => new Date().toISOString();

  async insertEvent(_org: OrganizationId, e: Omit<ClockEvent, "id">) {
    const dup = e.clientEventId ? this.events.find((x) => x.employeeId === e.employeeId && x.clientEventId === e.clientEventId) : undefined;
    if (dup) return { event: dup, duplicate: true };
    const event = { ...e, id: nextId() };
    this.events.push(event);
    return { event, duplicate: false };
  }
  async findEventByClientId(_org: OrganizationId, employeeId: string, clientEventId: string) {
    return this.events.find((x) => x.employeeId === employeeId && x.clientEventId === clientEventId) ?? null;
  }
  async getEvent(_org: OrganizationId, id: string) {
    return this.events.find((e) => e.id === id) ?? null;
  }
  async listEvents(_org: OrganizationId, employeeId: string, fromUtc: string, toUtc: string) {
    return this.events.filter((e) => e.employeeId === employeeId && e.occurredAt >= fromUtc && e.occurredAt < toUtc);
  }
  async listEventsSince(_org: OrganizationId, sinceUtc: string) {
    return this.events.filter((e) => e.occurredAt >= sinceUtc);
  }
  async insertRevision(_org: OrganizationId, r: Omit<ClockRevision, "id" | "createdAt"> & { before: unknown }) {
    const rev = { ...r, id: nextId(), createdAt: this.now() };
    this.revisions.push(rev);
    return rev;
  }
  async getRevision(_org: OrganizationId, id: string) {
    return this.revisions.find((r) => r.id === id) ?? null;
  }
  async listRevisions(_org: OrganizationId, employeeId: string, fromUtc: string, toUtc: string) {
    return this.revisions.filter((r) => r.employeeId === employeeId && r.anchorAt >= fromUtc && r.anchorAt < toUtc);
  }
  async refuseRevision(_org: OrganizationId, id: string) {
    const r = this.revisions.find((x) => x.id === id)!;
    r.state = "refused";
    return r;
  }
  async listRefusableRevisions(_org: OrganizationId, employeeId: string, now: string) {
    return this.revisions.filter((r) => r.employeeId === employeeId && r.state === "active" && r.refusableUntil !== null && r.refusableUntil >= now);
  }

  async insertCorrection(_org: OrganizationId, c: Parameters<AttendanceRepositoryPort["insertCorrection"]>[1]) {
    const row: CorrectionRequest = { ...c, id: nextId(), status: "pending", decidedBy: null, decidedAt: null, decisionComment: null, revisionId: null, createdAt: this.now() };
    this.corrections.push(row);
    return row;
  }
  async getCorrection(_org: OrganizationId, id: string) {
    return this.corrections.find((c) => c.id === id) ?? null;
  }
  async listCorrections(_org: OrganizationId, f: { status?: CorrectionRequest["status"]; employeeId?: string }) {
    return this.corrections.filter((c) => (!f.status || c.status === f.status) && (!f.employeeId || c.employeeId === f.employeeId));
  }
  async decideCorrection(_org: OrganizationId, id: string, d: { status: "approved" | "rejected"; decidedBy: string; comment: string | null; revisionId: string | null }) {
    const c = this.corrections.find((x) => x.id === id)!;
    Object.assign(c, { status: d.status, decidedBy: d.decidedBy, decidedAt: this.now(), decisionComment: d.comment, revisionId: d.revisionId });
    return c;
  }
  async currentDays(_org: OrganizationId, employeeId: string, from: string, to: string) {
    return this.days.filter((d) => d.current && d.employeeId === employeeId && d.workDate >= from && d.workDate <= to);
  }
  async insertDayVersion(_org: OrganizationId, d: Omit<DayVersion, "calculatedAt">) {
    for (const x of this.days) if (x.employeeId === d.employeeId && x.workDate === d.workDate) x.current = false;
    if (this.days.some((x) => x.employeeId === d.employeeId && x.workDate === d.workDate && x.version === d.version)) throw new Error("duplicate version");
    const row = { ...d, calculatedAt: this.now(), current: true };
    this.days.push(row);
    return row;
  }
  async insertAdjustment(_org: OrganizationId, a: Omit<Adjustment, "id" | "createdAt">) {
    const row = { ...a, id: nextId(), createdAt: this.now() };
    this.adjustments.push(row);
    return row;
  }
  async listAdjustments(_org: OrganizationId, employeeId: string, from: string, to: string) {
    return this.adjustments.filter((a) => a.employeeId === employeeId && a.workDate >= from && a.workDate <= to);
  }
  async ensureIncidents(_org: OrganizationId, items: { employeeId: string; workDate: string; type: IncidentType }[]) {
    for (const i of items) {
      if (this.incidents.some((x) => x.employeeId === i.employeeId && x.workDate === i.workDate && x.type === i.type && x.source === "engine")) continue;
      this.incidents.push({ ...i, id: nextId(), source: "engine", status: "open", comment: null, resolvedBy: null, resolvedAt: null });
    }
  }
  async getIncident(_org: OrganizationId, id: string) {
    return this.incidents.find((i) => i.id === id) ?? null;
  }
  async listIncidents(_org: OrganizationId, f: { status?: IncidentStatus; employeeId?: string; from: string; to: string }) {
    return this.incidents.filter((i) => (!f.status || i.status === f.status) && (!f.employeeId || i.employeeId === f.employeeId) && i.workDate >= f.from && i.workDate <= f.to);
  }
  async resolveIncident(_org: OrganizationId, id: string, r: { status: Exclude<IncidentStatus, "open">; comment: string | null; resolvedBy: string }) {
    const i = this.incidents.find((x) => x.id === id)!;
    Object.assign(i, { status: r.status, comment: r.comment, resolvedBy: r.resolvedBy, resolvedAt: this.now() });
    return i;
  }
  async enqueue(_org: OrganizationId, employeeId: string, dates: string[]) {
    for (const d of dates) if (!this.queue.some((q) => q.employeeId === employeeId && q.workDate === d)) this.queue.push({ employeeId, workDate: d });
  }
  async takeQueue(_org: OrganizationId, limit: number) {
    return this.queue.splice(0, limit);
  }
}

export const BASE_CONFIG: AttendanceConfig = {
  rules: {
    timeZone: "Europe/Lisbon",
    nightRule: "night_schedule_only",
    continuityMinutes: null,
    toleranceMinutes: 0,
    roundingMinutes: 0,
    autoClose: false,
    maxOpenHours: 16,
    incidentHoursCount: false,
    nightStart: null,
    nightEnd: null,
  },
  policy: { ipAllowlist: [], blockBeforeStartMinutes: null, requireCoordinates: false, blockOutsideGeofence: false },
  refusal: { enabled: false, hours: 48 },
};

export class FakeContext implements AttendanceContextPort {
  users = new Map<string, string>([
    ["u-emp", "e1"],
    ["u-boss", "e9"],
  ]);
  config_: AttendanceConfig = structuredClone(BASE_CONFIG);
  /** Plano por data; omissão = 8h, sem hora planeada. */
  plan: (date: string) => DayPlan = () => ({ theoreticalMinutes: 480, plannedStart: null, plannedEnd: null, nightSchedule: false, excused: false });
  location: { id: string; latitude: number | null; longitude: number | null; radiusMeters: number } | null = null;

  async employeeForUser(_org: OrganizationId, userId: string) {
    return this.users.get(userId) ?? null;
  }
  async timeZone() {
    return "Europe/Lisbon";
  }
  async config() {
    return structuredClone(this.config_);
  }
  async plans(_org: OrganizationId, _e: string, from: string, to: string) {
    const out = new Map<string, DayPlan>();
    for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      out.set(date, this.plan(date));
    }
    return out;
  }
  async punchLocation() {
    return this.location;
  }
}

export class FakeClockNow {
  constructor(public value: string) {}
  now() {
    return this.value;
  }
}

/** Corre as tarefas logo, mas guarda a promessa para o teste esperar. */
export class FakeBackground implements BackgroundPort {
  pending: Promise<void>[] = [];
  run(task: () => Promise<void>) {
    this.pending.push(task());
  }
  async flush() {
    while (this.pending.length) await this.pending.shift();
  }
}

export class FakeAudit {
  entries: { action: string; reason: string | null }[] = [];
  async record(_org: OrganizationId, e: { action: string; reason: string | null }) {
    this.entries.push({ action: e.action, reason: e.reason });
  }
}
