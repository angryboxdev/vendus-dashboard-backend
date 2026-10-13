import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CoverageGap, DashboardLayout, DashboardPerson, DashboardRequest } from "../../domain/entities/dashboard.js";
import type { DashboardLayoutRepositoryPort, DashboardSourcesPort, DashboardViewer } from "../../domain/ports/out/dashboard.ports.js";

/** Pessoa fictícia (RGPD: nomes inventados). */
export const person = (over: Partial<DashboardPerson> & { employeeId: string }): DashboardPerson => ({
  name: `Pessoa ${over.employeeId}`,
  locationId: "loc-a",
  locationName: "Loja A",
  status: "working",
  lateMinutes: 0,
  plannedStart: "09:00",
  plannedEnd: "17:00",
  firstInAt: null,
  absenceType: null,
  absenceCategory: null,
  ...over,
});

export const request = (over: Partial<DashboardRequest> & { key: string; employeeId: string }): DashboardRequest => ({
  type: "leave",
  employeeName: "Pessoa",
  locationName: "Loja A",
  title: "Férias",
  requestedAt: "2026-10-12T10:00:00Z",
  canDecide: true,
  ...over,
});

export class FakeViewer implements DashboardViewer {
  peopleCalls = 0;
  requestsCalls = 0;
  constructor(
    public userId: string,
    public list: DashboardPerson[],
    public reqs: DashboardRequest[] = [],
    public canSeeBirthdays = false,
    private readonly visible: (id: string) => boolean = () => true,
  ) {}
  async people() {
    this.peopleCalls++;
    return { today: "2026-10-13", people: this.list.filter((p) => this.visible(p.employeeId)), holidays: [{ date: "2026-11-01", name: "Todos os Santos" }] };
  }
  async requests() {
    this.requestsCalls++;
    return this.reqs.filter((r) => this.visible(r.employeeId));
  }
  async canSee(id: string) {
    return this.visible(id);
  }
}

export class FakeSources implements DashboardSourcesPort {
  gaps: CoverageGap[] = [];
  births: { employeeId: string; name: string; locationName: string | null; birthDate: string | null }[] = [];
  coverageCalls = 0;
  tomorrowOf(today: string) {
    return new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  async coverage(_o: OrganizationId, employees: { id: string }[]) {
    this.coverageCalls++;
    return this.gaps.filter((g) => employees.some((e) => e.id === g.employeeId));
  }
  async birthDates() {
    return this.births;
  }
}

export class FakeLayouts implements DashboardLayoutRepositoryPort {
  rows = new Map<string, DashboardLayout>();
  private k = (o: OrganizationId, u: string, d: string) => `${o}|${u}|${d}`;
  async get(o: OrganizationId, u: string, d: string) {
    return this.rows.get(this.k(o, u, d)) ?? null;
  }
  async save(o: OrganizationId, u: string, d: string, l: DashboardLayout) {
    this.rows.set(this.k(o, u, d), structuredClone(l));
  }
  async remove(o: OrganizationId, u: string, d: string) {
    this.rows.delete(this.k(o, u, d));
  }
}
