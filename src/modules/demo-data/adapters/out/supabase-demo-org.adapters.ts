import { randomUUID } from "node:crypto";
import { createDemoOrganization, findDemoOrganization, organizationInfo } from "../../../../infra/scoped-db/demo-organization.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DemoDataset } from "../../domain/entities/demo-dataset.js";
import type { DemoOrgRepositoryPort, DemoSeedPort } from "../../domain/ports/out/demo-org.ports.js";
import { buildSeedPlan, type Row } from "./demo-seed.rows.js";

export class SupabaseDemoOrgRepository implements DemoOrgRepositoryPort {
  async organization(org: OrganizationId) {
    const o = await organizationInfo(org);
    return o ? { name: o.name, isDemo: o.isDemo } : null;
  }
  demoOf(realOrg: OrganizationId) {
    return findDemoOrganization(realOrg);
  }
  async createDemo(realOrg: OrganizationId, input: { name: string; nif: string }) {
    const real = await organizationInfo(realOrg);
    return createDemoOrganization(realOrg, { ...input, timezone: real?.timezone ?? null });
  }
}

const CHUNK = 500;

/** Grava o plano na organização demo — recusa qualquer organização que não seja demo. */
export class SupabaseDemoSeeder implements DemoSeedPort {
  constructor(
    private readonly scoped: ScopedQueryFactory,
    private readonly ptHolidays: (year: number) => { date: string; name: string }[],
  ) {}

  async seed(demoOrg: OrganizationId, dataset: DemoDataset, opts: { actor: string; year: number }) {
    const info = await organizationInfo(demoOrg);
    if (!info?.isDemo) throw new Error("Recusado: só se carregam dados fictícios numa organização de demonstração.");
    const plan = buildSeedPlan(dataset, { newId: randomUUID, actor: opts.actor, year: opts.year, ptHolidays: this.ptHolidays(opts.year) });
    const q = this.scoped(demoOrg);
    const insert = async (table: Parameters<typeof q.table>[0], rows: Row[]) => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = (await q.table(table).insert(rows.slice(i, i + CHUNK))) as { error: { message: string } | null };
        if (error) throw new Error(`Dados de demonstração (${table}): ${error.message}`);
      }
    };
    await insert("locations", plan.locations);
    await insert("hr_positions", plan.positions);
    await insert("hr_employees", plan.employees);
    await insert("employment_contracts", plan.contracts);
    await insert("work_schedules", plan.schedules);
    await insert("work_schedule_versions", plan.scheduleVersions);
    await insert("holiday_calendars", plan.holidayCalendars);
    await insert("holiday_calendar_days", plan.holidayDays);
    await insert("time_assignments", plan.assignments);
    await insert("clock_events", plan.clockEvents);
    await insert("absence_types", plan.absenceTypes);
    return {
      locations: plan.locations.length,
      employees: plan.employees.length,
      schedules: plan.schedules.length,
      clockEvents: plan.clockEvents.length,
      absenceTypes: plan.absenceTypes.length,
      holidays: plan.holidayDays.length,
    };
  }
}
