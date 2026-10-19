import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CoverageRule, CoverageRuleInput } from "../../domain/services/coverage.js";
import type { Publication, Roster, RosterShift, ShiftState, ShiftTemplate, ShiftTemplateInput, Swap, WorkArea } from "../../domain/entities/roster.js";
import type { RostersContextPort, RostersRepositoryPort } from "../../domain/ports/out/rosters.ports.js";
import type { Rules } from "../../domain/services/constraints.js";

let seq = 0;
const nextId = () => `00000000-0000-4000-b000-${String(++seq).padStart(12, "0")}`;

export class FakeRostersRepository implements RostersRepositoryPort {
  templates: ShiftTemplate[] = [];
  rosters: Roster[] = [];
  shifts: RosterShift[] = [];
  publications: Publication[] = [];
  swaps: Swap[] = [];

  async listTemplates() {
    return this.templates.map((t) => ({ ...t }));
  }
  async createTemplate(_o: OrganizationId, t: ShiftTemplateInput) {
    const row = { ...t, id: nextId(), archived: false };
    this.templates.push(row);
    return row;
  }
  async setTemplateColor(_o: OrganizationId, id: string, color: string | null) {
    const t = this.templates.find((x) => x.id === id)!;
    t.color = color;
    return { ...t };
  }
  async archiveTemplate(_o: OrganizationId, id: string) {
    this.templates.find((t) => t.id === id)!.archived = true;
  }
  areas: WorkArea[] = [];
  async listAreas() {
    return this.areas.map((a) => ({ ...a })).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }
  async createArea(_o: OrganizationId, a: { locationId: string; name: string; sortOrder: number }) {
    const row: WorkArea = { ...a, id: nextId(), active: true };
    this.areas.push(row);
    return { ...row };
  }
  async updateArea(_o: OrganizationId, id: string, patch: Partial<Pick<WorkArea, "name" | "sortOrder" | "active">>) {
    const a = this.areas.find((x) => x.id === id)!;
    Object.assign(a, patch);
    return { ...a };
  }
  async listRosters() {
    return this.rosters.map((r) => ({ ...r }));
  }
  async createRoster(_o: OrganizationId, r: Pick<Roster, "name" | "targetType" | "targetId">) {
    const row = { ...r, id: nextId(), version: 0, archived: false };
    this.rosters.push(row);
    return { ...row };
  }
  async archiveRoster(_o: OrganizationId, id: string) {
    this.rosters.find((r) => r.id === id)!.archived = true;
  }
  async bumpVersion(_o: OrganizationId, id: string, expected: number) {
    const r = this.rosters.find((x) => x.id === id)!;
    if (r.version !== expected) return false;
    r.version++;
    return true;
  }
  async listShifts(_o: OrganizationId, f: { rosterId?: string; employeeIds?: string[]; from: string; to: string; includeDeleted?: boolean }) {
    return this.shifts
      .filter((s) => (!f.rosterId || s.rosterId === f.rosterId) && (!f.employeeIds || f.employeeIds.includes(s.employeeId)) && s.workDate >= f.from && s.workDate <= f.to && (f.includeDeleted || !s.deleted))
      .map((s) => structuredClone(s));
  }
  async clearPending(_o: OrganizationId, f: { rosterId: string; employeeId: string; from: string; to: string; ids?: string[] }) {
    const hit = this.shifts.filter((s) => s.rosterId === f.rosterId && s.employeeId === f.employeeId && s.workDate >= f.from && s.workDate <= f.to && !s.deleted && s.published === null && (!f.ids || f.ids.includes(s.id)));
    for (const s of hit) Object.assign(s, { deleted: true, dirty: false });
    return hit.map((s) => structuredClone(s));
  }
  async restoreShifts(_o: OrganizationId, rosterId: string, ids: string[]) {
    const hit = this.shifts.filter((s) => s.rosterId === rosterId && ids.includes(s.id) && s.deleted && s.published === null);
    for (const s of hit) Object.assign(s, { deleted: false, dirty: true });
    return hit.map((s) => structuredClone(s));
  }
  async getShift(_o: OrganizationId, id: string) {
    const s = this.shifts.find((x) => x.id === id);
    return s ? structuredClone(s) : null;
  }
  async insertShifts(_o: OrganizationId, rows: (ShiftState & { rosterId: string })[]) {
    const out = rows.map((r) => ({ ...r, id: nextId(), deleted: false, dirty: true, published: null, publishedVersion: null }));
    this.shifts.push(...out);
    return out.map((s) => structuredClone(s));
  }
  async updateShift(_o: OrganizationId, id: string, patch: Partial<RosterShift>) {
    const s = this.shifts.find((x) => x.id === id)!;
    Object.assign(s, structuredClone(patch));
    return structuredClone(s);
  }
  async insertPublication(_o: OrganizationId, p: Omit<Publication, "id" | "createdAt">) {
    const row = { ...structuredClone(p), id: nextId(), createdAt: new Date().toISOString() };
    this.publications.push(row);
    return row;
  }
  async listPublications(_o: OrganizationId, rosterId: string) {
    return this.publications.filter((p) => p.rosterId === rosterId);
  }
  async insertSwap(_o: OrganizationId, s: Omit<Swap, "id" | "status" | "decidedBy" | "createdAt">) {
    const row: Swap = { ...s, id: nextId(), status: "pending_target", decidedBy: null, createdAt: new Date().toISOString() };
    this.swaps.push(row);
    return { ...row };
  }
  async getSwap(_o: OrganizationId, id: string) {
    const s = this.swaps.find((x) => x.id === id);
    return s ? { ...s } : null;
  }
  async listSwaps(_o: OrganizationId, f: { status?: Swap["status"]; employeeId?: string }) {
    return this.swaps.filter((s) => (!f.status || s.status === f.status) && (!f.employeeId || s.requesterEmployeeId === f.employeeId || s.targetEmployeeId === f.employeeId));
  }
  async updateSwap(_o: OrganizationId, id: string, expected: Swap["status"], patch: { status: Swap["status"]; decidedBy?: string; comment?: string | null }) {
    const s = this.swaps.find((x) => x.id === id);
    if (!s || s.status !== expected) return null;
    Object.assign(s, patch);
    return { ...s };
  }
}

export const NO_RULES: Rules = { minRestMinutes: null, maxDailyMinutes: null, maxWeeklyMinutes: null, maxAnnualHours: null, restSeverity: "warning", limitsSeverity: "warning", absenceSeverity: "warning" };

export class FakeRostersContext implements RostersContextPort {
  rules_: Rules = { ...NO_RULES };
  absences = new Map<string, string[]>();
  users = new Map([["e1", "u-e1"], ["e2", "u-e2"], ["e9", "u-boss"]]);

  async rules() {
    return this.rules_;
  }
  async approvedAbsenceDates(_o: OrganizationId, employeeId: string) {
    return this.absences.get(employeeId) ?? [];
  }
  async employeeForUser(_o: OrganizationId, userId: string) {
    return [...this.users.entries()].find(([, u]) => u === userId)?.[0] ?? null;
  }
  async userOfEmployee(_o: OrganizationId, employeeId: string) {
    return this.users.get(employeeId) ?? null;
  }
  /** «Mostrar os turnos dos colegas» (desligado por omissão, como no catálogo). */
  coworkersOn = false;
  people: { id: string; fullName: string; positionName: string | null; active: boolean }[] = [];
  async coworkersVisible() {
    return this.coworkersOn;
  }
  async peopleBrief(_o: OrganizationId, ids: string[]) {
    return this.people.filter((p) => ids.includes(p.id));
  }
  /** Pertenças por alvo (`location:<id>` / `group:<id>`). */
  members = new Map<string, string[]>();
  async targetMembers(_o: OrganizationId, targetType: "location" | "group", targetId: string) {
    return this.members.get(`${targetType}:${targetId}`) ?? [];
  }
}

export class FakeRostersNotifier {
  sent: { userIds: string[]; title: string }[] = [];
  async notify(_o: OrganizationId, userIds: string[], n: { title: string }) {
    this.sent.push({ userIds, title: n.title });
  }
}

export class FakePublishedHook {
  calls: { employeeId: string; workDate: string }[][] = [];
  published(_o: OrganizationId, changes: { employeeId: string; workDate: string }[]) {
    this.calls.push(changes);
  }
}

export class FakeRostersAudit {
  actions: { action: string; reason: string | null }[] = [];
  async record(_o: OrganizationId, e: { action: string; reason: string | null }) {
    this.actions.push({ action: e.action, reason: e.reason });
  }
}

export class FakeCoverageRules {
  rules: CoverageRule[] = [];
  async listCoverageRules(_o: OrganizationId, locationId?: string | null) {
    return this.rules.filter((r) => !locationId || r.locationId === locationId).map((r) => ({ ...r }));
  }
  async createCoverageRule(_o: OrganizationId, r: CoverageRuleInput) {
    const row = { ...r, id: `cov-${this.rules.length + 1}` };
    this.rules.push(row);
    return { ...row };
  }
  async updateCoverageRule(_o: OrganizationId, id: string, patch: Partial<Pick<CoverageRule, "start" | "end" | "minPeople">>) {
    const r = this.rules.find((x) => x.id === id)!;
    Object.assign(r, patch);
    return { ...r };
  }
  async deleteCoverageRule(_o: OrganizationId, id: string) {
    this.rules = this.rules.filter((r) => r.id !== id);
  }
}

export class FakeCoverageContext {
  on = true;
  absences = new Map<string, string[]>();
  async enabled() {
    return this.on;
  }
  async approvedAbsenceDates(_o: OrganizationId, employeeId: string) {
    return this.absences.get(employeeId) ?? [];
  }
}
