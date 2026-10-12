import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import type { DemoDataset } from "../../domain/entities/demo-dataset.js";
import type { DemoOrg } from "../../domain/entities/demo-org.js";
import type { DemoOrgRepositoryPort, DemoOrgSupportPort, DemoSeedPort } from "../../domain/ports/out/demo-org.ports.js";

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
