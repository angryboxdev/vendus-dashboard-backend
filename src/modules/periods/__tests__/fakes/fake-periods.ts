import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Closure, EmployeeTotals, ExportJob, PayPeriod, PendingItem, Reopening } from "../../domain/entities/period.js";
import type { PeriodsContextPort, PeriodsRepositoryPort, PeriodsSupportPort } from "../../domain/ports/out/periods.ports.js";

let seq = 0;
const nextId = () => `00000000-0000-4000-c000-${String(++seq).padStart(12, "0")}`;

export class FakePeriodsRepository implements PeriodsRepositoryPort {
  periods: PayPeriod[] = [];
  closures: Closure[] = [];
  reopenings: Reopening[] = [];
  exports: (ExportJob & { content: string | null; token: string | null })[] = [];

  async listPeriods() {
    return this.periods.map((p) => ({ ...p }));
  }
  async createPeriod(_o: OrganizationId, p: Omit<PayPeriod, "id" | "status">) {
    const row = { ...p, id: nextId(), status: "open" as const };
    this.periods.push(row);
    return { ...row };
  }
  async setStatus(_o: OrganizationId, id: string, expected: PayPeriod["status"][], status: PayPeriod["status"]) {
    const p = this.periods.find((x) => x.id === id);
    if (!p || !expected.includes(p.status)) return false;
    p.status = status;
    return true;
  }
  async listClosures(_o: OrganizationId, periodId: string) {
    return this.closures.filter((c) => c.periodId === periodId);
  }
  async insertClosure(_o: OrganizationId, c: Omit<Closure, "id" | "createdAt">) {
    const row = { ...structuredClone(c), id: nextId(), createdAt: new Date().toISOString() };
    this.closures.push(row);
    return row;
  }
  async listReopenings(_o: OrganizationId, periodId?: string) {
    return this.reopenings.filter((r) => !periodId || r.periodId === periodId).map((r) => structuredClone(r));
  }
  async getReopening(_o: OrganizationId, id: string) {
    const r = this.reopenings.find((x) => x.id === id);
    return r ? structuredClone(r) : null;
  }
  async insertReopening(_o: OrganizationId, r: Omit<Reopening, "id" | "approvals" | "status">) {
    const row: Reopening = { ...r, id: nextId(), approvals: [], status: "pending" };
    this.reopenings.push(row);
    return structuredClone(row);
  }
  async updateReopening(_o: OrganizationId, id: string, expectedApprovals: number, patch: Pick<Reopening, "approvals" | "status">) {
    const r = this.reopenings.find((x) => x.id === id);
    if (!r || r.status !== "pending" || r.approvals.length !== expectedApprovals) return null;
    Object.assign(r, structuredClone(patch));
    return structuredClone(r);
  }
  async insertExport(_o: OrganizationId, j: Pick<ExportJob, "periodId" | "kind" | "requestedBy" | "requestedByUserId" | "includeSensitive">) {
    const row = { ...j, id: nextId(), status: "queued" as const, error: null, fileName: null, totals: null, expiresAt: null, createdAt: new Date().toISOString(), content: null, token: null };
    this.exports.push(row);
    return { ...row };
  }
  async updateExport(_o: OrganizationId, id: string, patch: Partial<ExportJob> & { content?: string; token?: string }) {
    Object.assign(this.exports.find((x) => x.id === id)!, patch);
  }
  async listExports(_o: OrganizationId, userId: string) {
    return this.exports.filter((x) => x.requestedByUserId === userId);
  }
  async getExportFile(_o: OrganizationId, id: string) {
    const x = this.exports.find((e) => e.id === id);
    return x ? { job: x, content: x.content, token: x.token } : null;
  }
}

export const zeroTotals = (employeeId: string): EmployeeTotals => ({
  employeeId,
  workedSeconds: 0,
  theoreticalSeconds: 0,
  excessSeconds: 0,
  nightSeconds: 0,
  pendingSeconds: 0,
  absences: [],
  bankSeconds: 0,
  bankPaidSeconds: 0,
  byLocation: [],
});

export class FakePeriodsContext implements Omit<PeriodsContextPort, never> {
  employees = ["e1", "e2"];
  locations = new Map<string, string[]>([["e1", ["loc-porto"]], ["e2", ["loc-lisboa"]]]);
  pending: PendingItem[] = [];
  prepared: string[] = [];
  totalsBy = new Map<string, EmployeeTotals>();

  async employeesInScope(_o: OrganizationId, p: PayPeriod) {
    return p.scopeType === "organization" ? this.employees : this.employees.filter((e) => this.locations.get(e)?.includes(p.scopeId!));
  }
  async employeeLocations(_o: OrganizationId, employeeId: string) {
    return this.locations.get(employeeId) ?? [];
  }
  async pendingItems() {
    return this.pending;
  }
  async prepare(_o: OrganizationId, employeeId: string) {
    this.prepared.push(employeeId);
  }
  async totals(_o: OrganizationId, employeeId: string) {
    return structuredClone(this.totalsBy.get(employeeId) ?? zeroTotals(employeeId));
  }
  async employeeInfo(_o: OrganizationId, ids: string[]) {
    return ids.map((id) => ({ employeeId: id, name: id === "e1" ? "Ana Teste" : "=Bruno;Teste", nif: id === "e1" ? "123456789" : null }));
  }
  async locationName(_o: OrganizationId, id: string | null) {
    return id === "loc-porto" ? "Porto" : id === "loc-lisboa" ? "Lisboa" : "Sem centro";
  }
}

export class FakeSupport implements PeriodsSupportPort {
  nowValue = "2026-11-02T10:00:00.000Z";
  tasks: Promise<void>[] = [];
  token() {
    return "tok-123";
  }
  now() {
    return this.nowValue;
  }
  background(task: () => Promise<void>) {
    this.tasks.push(task());
  }
  async flush() {
    while (this.tasks.length) await this.tasks.shift();
  }
}

export class FakePeriodsAudit {
  actions: string[] = [];
  async record(_o: OrganizationId, e: { action: string }) {
    this.actions.push(e.action);
  }
}
