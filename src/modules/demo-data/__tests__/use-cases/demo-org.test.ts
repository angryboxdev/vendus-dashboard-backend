import { randomUUID } from "node:crypto";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { buildSeedPlan } from "../../adapters/out/demo-seed.rows.js";
import { DemoOrgUseCases } from "../../application/use-cases/demo-org.use-cases.js";
import { generateDemoDataset } from "../../domain/services/demo-dataset.generator.js";
import { FakeDemoOrgRepository, FakeDemoSeeder, FakeDemoSupport } from "../fakes/fake-demo-org.js";

const REAL = mintOrganizationId("org-real");
const admin = { email: "admin@demo.invalid", isAdmin: true };

function setup() {
  const repo = new FakeDemoOrgRepository();
  const seeder = new FakeDemoSeeder();
  const support = new FakeDemoSupport();
  let t = 0;
  const uc = new DemoOrgUseCases(repo, seeder, support, () => t);
  return { repo, seeder, support, uc, advance: (ms: number) => (t += ms) };
}

describe("Organização de demonstração (ADR-0034)", () => {
  test("cria a organização ligada à real, carrega 4 semanas até ontem e audita na real", async () => {
    const { repo, seeder, support, uc } = setup();
    expect(await uc.status(REAL)).toEqual({ exists: false, name: null });
    const out = await uc.create(REAL, admin);
    expect(out.demo.name).toBe("Mezza — Demonstração");
    expect(repo.orgs.get(out.demo.id)).toMatchObject({ isDemo: true, demoOf: "org-real", nif: "DEMO-ORG-REAL" });
    expect(seeder.seeded).toHaveLength(1);
    expect(seeder.seeded[0]).toMatchObject({ org: out.demo.id, year: 2026 });
    expect(seeder.seeded[0].dataset.period).toEqual({ from: "2026-09-14", to: "2026-10-11" });
    expect(seeder.seeded[0].dataset.employees).toHaveLength(20);
    expect(support.audits).toEqual([{ org: "org-real", action: "demo.organization.create", resourceId: out.demo.id }]);
    expect(await uc.status(REAL)).toEqual({ exists: true, name: "Mezza — Demonstração" });
  });

  test("só Admin; não cria duas; não cria a partir de uma organização demo", async () => {
    const { uc } = setup();
    await expect(uc.create(REAL, { ...admin, isAdmin: false })).rejects.toMatchObject({ code: "admin_only" });
    const { demo } = await uc.create(REAL, admin);
    await expect(uc.create(REAL, admin)).rejects.toMatchObject({ code: "already_exists" });
    await expect(uc.create(demo.id, admin)).rejects.toMatchObject({ code: "is_demo" });
    await expect(uc.create(mintOrganizationId("org-x"), admin)).rejects.toMatchObject({ code: "not_found" });
  });

  test("resolve usa cache curta, limpa ao criar", async () => {
    const { repo, uc, advance } = setup();
    expect(await uc.resolve(REAL)).toBeNull();
    expect(await uc.resolve(REAL)).toBeNull();
    expect(repo.demoOfCalls).toBe(1);
    const { demo } = await uc.create(REAL, admin);
    expect(await uc.resolve(REAL)).toBe(demo.id);
    advance(61_000);
    expect(await uc.resolve(REAL)).toBe(demo.id);
  });
});

describe("Plano de linhas da organização demo", () => {
  const d = generateDemoDataset({ seed: 20261012, employeesPerCenter: 5, from: "2026-09-14", to: "2026-10-11" });
  const plan = buildSeedPlan(d, { newId: randomUUID, actor: "admin@demo.invalid", year: 2026, ptHolidays: [{ date: "2026-10-05", name: "Implantação da República" }] });

  test("só dados fictícios e todas as referências resolvidas", () => {
    expect(plan.locations).toHaveLength(4);
    expect(plan.employees).toHaveLength(20);
    expect(plan.employees.every((e) => String(e.email).endsWith(".invalid"))).toBe(true);
    const locIds = new Set(plan.locations.map((l) => l.id));
    const empIds = new Set(plan.employees.map((e) => e.id));
    const schedIds = new Set(plan.schedules.map((s) => s.id));
    expect(plan.employees.every((e) => locIds.has(e.primary_location_id) && e.position_id)).toBe(true);
    expect(plan.clockEvents.every((c) => empIds.has(c.employee_id) && locIds.has(c.location_id))).toBe(true);
    expect(plan.assignments.filter((a) => a.resource_type === "schedule").every((a) => schedIds.has(a.resource_id) && empIds.has(a.target_id))).toBe(true);
    // Feriados de PT só nos centros de Portugal.
    const pt = plan.locations.filter((l) => l.country === "PT").map((l) => l.id);
    expect(plan.assignments.filter((a) => a.resource_type === "holiday_calendar").map((a) => a.target_id).sort()).toEqual([...pt].sort());
  });

  test("horário noturno marcado como night, faixas por dia ISO", () => {
    expect(plan.scheduleVersions.some((v) => v.night === true)).toBe(true);
    for (const v of plan.scheduleVersions) for (const k of Object.keys(v.days as object)) expect(["1", "2", "3", "4", "5", "6", "7"]).toContain(k);
  });
});
