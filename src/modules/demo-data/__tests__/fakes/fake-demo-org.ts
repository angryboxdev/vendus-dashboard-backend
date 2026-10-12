import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import type { DemoDataset } from "../../domain/entities/demo-dataset.js";
import type { DemoOrg } from "../../domain/entities/demo-org.js";
import type { DemoLivePort, DemoOrgRepositoryPort, DemoOrgSupportPort, DemoScenarioPort, DemoSeedPort } from "../../domain/ports/out/demo-org.ports.js";
import { generateDemoDataset } from "../../domain/services/demo-dataset.generator.js";
import type { ScenarioPlan } from "../../domain/services/demo-scenario.js";

export class FakeDemoOrgRepository implements DemoOrgRepositoryPort {
  orgs = new Map<string, { name: string; isDemo: boolean; demoOf: string | null; nif: string }>([["org-real", { name: "Mezza", isDemo: false, demoOf: null, nif: "500000000" }]]);
  demoOfCalls = 0;
  async organization(org: OrganizationId) {
    const o = this.orgs.get(org);
    return o ? { name: o.name, isDemo: o.isDemo } : null;
  }
  async demoOf(realOrg: OrganizationId): Promise<DemoOrg | null> {
    this.demoOfCalls++;
    const hit = [...this.orgs].find(([, o]) => o.demoOf === realOrg);
    return hit ? { id: mintOrganizationId(hit[0]), name: hit[1].name } : null;
  }
  async createDemo(realOrg: OrganizationId, input: { name: string; nif: string }) {
    const id = `demo-${this.orgs.size}`;
    this.orgs.set(id, { name: input.name, isDemo: true, demoOf: realOrg, nif: input.nif });
    return { id: mintOrganizationId(id), name: input.name };
  }
}

export class FakeDemoSeeder implements DemoSeedPort {
  seeded: { org: string; dataset: DemoDataset; year: number }[] = [];
  async seed(demoOrg: OrganizationId, dataset: DemoDataset, opts: { actor: string; year: number }) {
    this.seeded.push({ org: demoOrg, dataset, year: opts.year });
    return { locations: dataset.centers.length, employees: dataset.employees.length, schedules: 4, clockEvents: dataset.punches.length, absenceTypes: 3, holidays: 13 };
  }
}

export class FakeDemoSupport implements DemoOrgSupportPort {
  todayValue = "2026-10-12";
  audits: { org: string; action: string; resourceId: string }[] = [];
  async today() {
    return this.todayValue;
  }
  async audit(org: OrganizationId, e: { actor: string; action: string; resourceId: string; after: unknown }) {
    this.audits.push({ org, action: e.action, resourceId: e.resourceId });
  }
}

/** Dados vivos em memória: os colaboradores do gerador (mesma semente) com ids "db-<chave>". */
export class FakeDemoLive implements DemoLivePort {
  punches: { employeeId: string; occurredAt: string; segmentType: string; clientEventId: string; locationId: string | null }[] = [];
  absences: { employeeId: string; startDate: string; endDate: string }[] = [];
  vacationEnsured = 0;
  async employees() {
    const ds = generateDemoDataset({ seed: 20261012, employeesPerCenter: 5, from: "2026-10-12", to: "2026-10-12" });
    return ds.employees.map((e) => ({ id: `db-${e.key}`, email: e.email, locationId: `loc-${e.centerKey}` }));
  }
  async existingEventIds() {
    return new Set(this.punches.map((p) => p.clientEventId));
  }
  async absenceDays() {
    return this.absences;
  }
  async insertPunches(_o: OrganizationId, rows: FakeDemoLive["punches"]) {
    this.punches.push(...rows);
    return rows.length;
  }
  async ensureVacationType() {
    this.vacationEnsured++;
  }
}

export class FakeDemoScenario implements DemoScenarioPort {
  plans: ScenarioPlan[] = [];
  constructor(private readonly live: FakeDemoLive) {}
  async hasScenario() {
    return this.plans.length > 0;
  }
  async build(_o: OrganizationId, _a: { userId: string; email: string }, plan: ScenarioPlan) {
    this.plans.push(plan);
    this.live.absences.push(...plan.approved, ...plan.pending);
    return { rosters: plan.rosters.length, approved: plan.approved.length, pending: plan.pending.length };
  }
}
