import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AbsenceType, AbsenceTypeInput, VacationRules } from "../../domain/entities/absence-type.js";
import type { ApprovalFlow, ApprovalFlowInput } from "../../domain/entities/approval-flow.js";
import type { AbsenceRequest, ApprovalDecision, LedgerEntry, RequestStatus } from "../../domain/entities/request.js";
import type { AbsencesContextPort, AbsencesRepositoryPort } from "../../domain/ports/out/absences.ports.js";
import type { PlanDay } from "../../domain/services/absence-calc.js";

let seq = 0;
const nextId = () => `00000000-0000-4000-9000-${String(++seq).padStart(12, "0")}`;

export class FakeAbsencesRepository implements AbsencesRepositoryPort {
  types: AbsenceType[] = [];
  flows: ApprovalFlow[] = [];
  requests: AbsenceRequest[] = [];
  decisions: ApprovalDecision[] = [];
  entries: LedgerEntry[] = [];

  async listTypes() {
    return this.types.map((t) => ({ ...t }));
  }
  async createType(_o: OrganizationId, t: AbsenceTypeInput) {
    const row = { ...t, id: nextId(), archived: false };
    this.types.push(row);
    return row;
  }
  async updateType(_o: OrganizationId, id: string, t: AbsenceTypeInput) {
    const i = this.types.findIndex((x) => x.id === id);
    this.types[i] = { ...t, id, archived: false };
    return this.types[i]!;
  }
  async archiveType(_o: OrganizationId, id: string) {
    this.types.find((x) => x.id === id)!.archived = true;
  }
  async listFlows() {
    return this.flows.map((f) => ({ ...f }));
  }
  async createFlow(_o: OrganizationId, f: ApprovalFlowInput) {
    const row = { ...f, id: nextId(), archived: false };
    this.flows.push(row);
    return row;
  }
  async updateFlow(_o: OrganizationId, id: string, f: ApprovalFlowInput) {
    const i = this.flows.findIndex((x) => x.id === id);
    this.flows[i] = { ...f, id, archived: false };
    return this.flows[i]!;
  }
  async archiveFlow(_o: OrganizationId, id: string) {
    this.flows.find((x) => x.id === id)!.archived = true;
  }
  async clearDefault(_o: OrganizationId, scope: ApprovalFlow["scope"], exceptId: string) {
    for (const f of this.flows) if (f.scope === scope && f.id !== exceptId) f.isDefault = false;
  }
  async insertRequest(_o: OrganizationId, r: Omit<AbsenceRequest, "id" | "createdAt" | "decidedAt" | "cancelReason">) {
    const row: AbsenceRequest = { ...r, id: nextId(), createdAt: new Date().toISOString(), decidedAt: null, cancelReason: null };
    this.requests.push(row);
    return { ...row };
  }
  async getRequest(_o: OrganizationId, id: string) {
    const r = this.requests.find((x) => x.id === id);
    return r ? { ...r } : null;
  }
  async listRequests(_o: OrganizationId, f: { status?: RequestStatus; employeeId?: string; from?: string; to?: string }) {
    return this.requests.filter((r) => (!f.status || r.status === f.status) && (!f.employeeId || r.employeeId === f.employeeId) && (!f.from || r.endDate >= f.from) && (!f.to || r.startDate <= f.to)).map((r) => ({ ...r }));
  }
  async updateRequest(_o: OrganizationId, id: string, expected: { status: RequestStatus; currentLevel: number }, patch: Partial<AbsenceRequest>) {
    const r = this.requests.find((x) => x.id === id);
    if (!r || r.status !== expected.status || r.currentLevel !== expected.currentLevel) return null;
    Object.assign(r, patch);
    return { ...r };
  }
  async insertDecision(_o: OrganizationId, d: Omit<ApprovalDecision, "id" | "createdAt">) {
    const row = { ...d, id: nextId(), createdAt: new Date().toISOString() };
    this.decisions.push(row);
    return row;
  }
  async listDecisions(_o: OrganizationId, requestId: string) {
    return this.decisions.filter((d) => d.requestId === requestId);
  }
  async insertEntry(_o: OrganizationId, e: Omit<LedgerEntry, "id" | "createdAt">) {
    if (e.kind === "accrual" && this.entries.some((x) => x.kind === "accrual" && x.employeeId === e.employeeId && x.typeId === e.typeId && x.period === e.period)) return null;
    if (e.kind === "holiday_compensation" && this.entries.some((x) => x.kind === "holiday_compensation" && x.employeeId === e.employeeId && x.referenceDate === e.referenceDate)) return null;
    const row = { ...e, id: nextId(), createdAt: new Date().toISOString() };
    this.entries.push(row);
    return row;
  }
  async listEntries(_o: OrganizationId, f: { employeeId: string; typeId?: string; period?: string }) {
    return this.entries.filter((e) => e.employeeId === f.employeeId && (!f.typeId || e.typeId === f.typeId) && (!f.period || e.period === f.period));
  }
}

/** Horário de teste: seg–sex 09:00–13:00 e 14:00–18:00 (8 h); fim de semana sem trabalho. */
export const weekdayPlan = (date: string): PlanDay => {
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  const work = wd >= 1 && wd <= 5;
  return { date, minutes: work ? 480 : 0, plannedRanges: work ? [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }] : [] };
};

export class FakeAbsencesContext implements AbsencesContextPort {
  users = new Map([["e1", "u-emp"], ["e9", "u-boss"]]);
  managers = new Map<string, string[]>([["e1", ["u-boss"]]]);
  profiles = new Map<string, string[]>([["11111111-1111-4111-8111-111111111111", ["u-rh"]]]);
  admins = ["u-admin"];
  contract = { from: "2020-03-15", to: null as string | null };
  plan: (date: string) => PlanDay = weekdayPlan;
  vacation: VacationRules | null = null;
  holidays = new Map<string, { name: string; coefficient: number; approvalRequired: boolean }>();
  worked = new Map<string, number>();

  async employeeForUser(_o: OrganizationId, userId: string) {
    return [...this.users.entries()].find(([, u]) => u === userId)?.[0] ?? null;
  }
  async userOfEmployee(_o: OrganizationId, employeeId: string) {
    return this.users.get(employeeId) ?? null;
  }
  async contractCoverage(_o: OrganizationId, _e: string, from: string, to: string) {
    const covered = from >= this.contract.from && (this.contract.to === null || to <= this.contract.to);
    return { covered, contractStart: this.contract.from };
  }
  async planDays(_o: OrganizationId, _e: string, from: string, to: string) {
    const out: PlanDay[] = [];
    for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(this.plan(d.toISOString().slice(0, 10)));
    return out;
  }
  async vacationRulesFor() {
    return this.vacation;
  }
  async managerUserIds(_o: OrganizationId, employeeId: string) {
    return this.managers.get(employeeId) ?? [];
  }
  async profileUserIds(_o: OrganizationId, profileId: string) {
    return this.profiles.get(profileId) ?? [];
  }
  async adminUserIds() {
    return this.admins;
  }
  async holidayOn(_o: OrganizationId, _e: string, date: string) {
    return this.holidays.get(date) ?? null;
  }
  async workedSeconds(_o: OrganizationId, _e: string, date: string) {
    return this.worked.get(date) ?? 0;
  }
}

export class FakeNotifier {
  sent: { userIds: string[]; title: string }[] = [];
  async notify(_o: OrganizationId, userIds: string[], n: { title: string }) {
    this.sent.push({ userIds, title: n.title });
  }
}

export class FakeAbsencesAudit {
  entries: string[] = [];
  async record(_o: OrganizationId, e: { action: string }) {
    this.entries.push(e.action);
  }
}

export const TYPE_BASE: AbsenceTypeInput = {
  name: "Consulta médica",
  code: null,
  color: null,
  category: "permission",
  unit: "days",
  counting: "working",
  limitAmount: null,
  renewal: "calendar_year",
  allowNegative: false,
  carryOver: false,
  requiresApproval: true,
  private: false,
  hiddenFromEmployee: false,
  attachment: "none",
  timeImpact: "reduce_theoretical",
  intersectSchedule: true,
  halfDay: false,
  minConsecutive: null,
  maxConsecutive: null,
  blockedDates: [],
  paid: true,
  flowId: null,
};
