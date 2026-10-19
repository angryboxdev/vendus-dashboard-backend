import { randomUUID } from "node:crypto";
import { createDemoOrganization, findDemoOrganization, organizationInfo } from "../../../../infra/scoped-db/demo-organization.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DemoDataset, DemoEmployee } from "../../domain/entities/demo-dataset.js";
import type { DemoLivePort, DemoOrgRepositoryPort, DemoSeedPort } from "../../domain/ports/out/demo-org.ports.js";
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

const PAGE = 1000;

/** Dados vivos da demonstração (ScopedQuery da demo; recusa organizações que não sejam demo). */
export class SupabaseDemoLive implements DemoLivePort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  private async guard(demoOrg: OrganizationId) {
    if (!(await organizationInfo(demoOrg))?.isDemo) throw new Error("Recusado: não é uma organização de demonstração.");
  }

  async employees(demoOrg: OrganizationId) {
    const { data, error } = (await this.scoped(demoOrg).table("hr_employees").select("id, email, primary_location_id, photo_storage_path, birth_date").eq("status", "active")) as { data: Row[] | null; error: { message: string } | null };
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ id: String(r.id), email: r.email ? String(r.email) : null, locationId: r.primary_location_id ? String(r.primary_location_id) : null, photoPath: r.photo_storage_path ? String(r.photo_storage_path) : null, birthDate: r.birth_date ? String(r.birth_date).slice(0, 10) : null }));
  }

  async setBirthDates(demoOrg: OrganizationId, rows: { id: string; birthDate: string }[]) {
    await this.guard(demoOrg);
    const q = this.scoped(demoOrg);
    for (const r of rows) {
      const { error } = (await q.table("hr_employees").update({ birth_date: r.birthDate }).eq("id", r.id).is("birth_date", null)) as { error: { message: string } | null };
      if (error) throw new Error(`Aniversários de demonstração: ${error.message}`);
    }
  }

  async setPhotos(demoOrg: OrganizationId, rows: { id: string; photoPath: string }[]) {
    await this.guard(demoOrg);
    const q = this.scoped(demoOrg);
    for (const r of rows) {
      const { error } = (await q.table("hr_employees").update({ photo_storage_path: r.photoPath }).eq("id", r.id).is("photo_storage_path", null)) as { error: { message: string } | null };
      if (error) throw new Error(`Fotos de demonstração: ${error.message}`);
    }
  }

  async existingEventIds(demoOrg: OrganizationId, sinceUtc: string) {
    const ids = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = (await this.scoped(demoOrg)
        .table("clock_events")
        .select("client_event_id")
        .gte("occurred_at", sinceUtc)
        .not("client_event_id", "is", null)
        .order("id")
        .range(from, from + PAGE - 1)) as { data: Row[] | null; error: { message: string } | null };
      if (error) throw new Error(error.message);
      for (const r of data ?? []) ids.add(String(r.client_event_id));
      if (!data || data.length < PAGE) break;
    }
    return ids;
  }

  async absenceDays(demoOrg: OrganizationId, from: string, to: string) {
    const { data, error } = (await this.scoped(demoOrg)
      .table("absence_requests")
      .select("employee_id, start_date, end_date")
      .in("status", ["approved", "pending"])
      .lte("start_date", to)
      .gte("end_date", from)) as { data: Row[] | null; error: { message: string } | null };
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ employeeId: String(r.employee_id), startDate: String(r.start_date), endDate: String(r.end_date) }));
  }

  async insertPunches(demoOrg: OrganizationId, rows: { employeeId: string; occurredAt: string; segmentType: string; clientEventId: string; locationId: string | null }[]) {
    await this.guard(demoOrg);
    const q = this.scoped(demoOrg);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => ({ employee_id: r.employeeId, occurred_at: r.occurredAt, segment_type: r.segmentType, source: "web", client_event_id: r.clientEventId, location_id: r.locationId }));
      const { error } = (await q.table("clock_events").insert(chunk)) as { error: { message: string } | null };
      if (error) throw new Error(`Marcações de demonstração: ${error.message}`);
    }
    return rows.length;
  }

  async addEmployees(demoOrg: OrganizationId, employees: DemoEmployee[], schedules: { key: string; name: string }[], centers: { key: string; name: string }[], positions: { key: string; name: string }[], actor: string, year: number) {
    await this.guard(demoOrg);
    if (!employees.length) return 0;
    const q = this.scoped(demoOrg);
    const read = async (table: Parameters<typeof q.table>[0]) => {
      const { data, error } = (await q.table(table).select("id, name")) as { data: Row[] | null; error: { message: string } | null };
      if (error) throw new Error(`Dados de demonstração (${table}): ${error.message}`);
      return new Map((data ?? []).map((r) => [String(r.name), String(r.id)]));
    };
    const [locs, poss, scheds] = await Promise.all([read("locations"), read("hr_positions"), read("work_schedules")]);
    const locOf = new Map(centers.map((c) => [c.key, locs.get(c.name) ?? null]));
    const posOf = new Map(positions.map((p) => [p.key, poss.get(p.name) ?? null]));
    const schedOf = new Map(schedules.map((x) => [x.key, scheds.get(`${x.name} (demo)`) ?? null]));
    const emp: Row[] = [];
    const contracts: Row[] = [];
    const assignments: Row[] = [];
    for (const e of employees) {
      const id = randomUUID();
      emp.push({
        id,
        full_name: `${e.firstName} ${e.lastName}`,
        first_name: e.firstName,
        last_name: e.lastName,
        email: e.email,
        status: "active",
        hired_at: e.hireDate,
        primary_location_id: locOf.get(e.centerKey) ?? null,
        position_id: posOf.get(e.positionKey) ?? null,
        role_or_notes: "Colaborador fictício (demonstração)",
        photo_storage_path: e.photoPath,
      });
      contracts.push({ id: randomUUID(), employee_id: id, contract_type: "permanent", start_date: e.hireDate, weekly_hours: 40, status: "active", created_by: actor });
      const schedule = schedOf.get(e.scheduleKey);
      if (schedule) assignments.push({ id: randomUUID(), resource_type: "schedule", resource_id: schedule, target_type: "employee", target_id: id, valid_from: `${year - 1}-01-01`, created_by: actor });
    }
    const insert = async (table: Parameters<typeof q.table>[0], rows: Row[]) => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = (await q.table(table).insert(rows.slice(i, i + CHUNK))) as { error: { message: string } | null };
        if (error) throw new Error(`Dados de demonstração (${table}): ${error.message}`);
      }
    };
    await insert("hr_employees", emp);
    await insert("employment_contracts", contracts);
    await insert("time_assignments", assignments);
    return emp.length;
  }

  async ensureVacationType(demoOrg: OrganizationId, actor: string) {
    await this.guard(demoOrg);
    const q = this.scoped(demoOrg);
    const { data, error } = (await q.table("absence_types").select("id").eq("category", "vacation").limit(1)) as { data: Row[] | null; error: { message: string } | null };
    if (error) throw new Error(error.message);
    if (data?.length) return;
    const ins = (await q.table("absence_types").insert({ name: "Férias (demo)", category: "vacation", unit: "days", counting: "working", limit_amount: 22, requires_approval: true, time_impact: "reduce_theoretical", created_by: actor })) as { error: { message: string } | null };
    if (ins.error) throw new Error(ins.error.message);
  }
}
