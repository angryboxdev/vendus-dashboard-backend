import { randomUUID } from "node:crypto";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { buildSeedPlan } from "../../adapters/out/demo-seed.rows.js";
import { DemoOrgUseCases } from "../../application/use-cases/demo-org.use-cases.js";
import { generateDemoDataset, generatePunches } from "../../domain/services/demo-dataset.generator.js";
import { keyFromEmail, planScenario } from "../../domain/services/demo-scenario.js";
import { FakeDemoLive, FakeDemoOrgRepository, FakeDemoScenario, FakeDemoSeeder, FakeDemoSupport } from "../fakes/fake-demo-org.js";

const REAL = mintOrganizationId("org-real");
const admin = { userId: "u-admin", email: "admin@demo.invalid", isAdmin: true };
// 2026-10-12 (segunda-feira) às 11:00 em Lisboa.
const NOW = Date.parse("2026-10-12T10:00:00Z");

function setup() {
  const repo = new FakeDemoOrgRepository();
  const seeder = new FakeDemoSeeder();
  const support = new FakeDemoSupport();
  const live = new FakeDemoLive();
  const scenario = new FakeDemoScenario(live);
  let t = NOW;
  const uc = new DemoOrgUseCases(repo, seeder, support, live, scenario, () => t);
  return { repo, seeder, support, live, scenario, uc, advance: (ms: number) => (t += ms) };
}

describe("Organização de demonstração (ADR-0034)", () => {
  test("cria a organização ligada à real, o cenário e as marcações até agora; audita na real", async () => {
    const { repo, seeder, support, live, scenario, uc } = setup();
    expect(await uc.status(REAL)).toEqual({ exists: false, name: null });
    const out = await uc.create(REAL, admin);
    expect(out.demo.name).toBe("Mezza — Demonstração");
    expect(repo.orgs.get(out.demo.id)).toMatchObject({ isDemo: true, demoOf: "org-real", nif: "DEMO-ORG-REAL" });
    expect(seeder.seeded[0]!.dataset.employees).toHaveLength(20);
    expect(seeder.seeded[0]!.dataset.punches).toHaveLength(0);
    expect(scenario.plans).toHaveLength(1);
    expect(live.punches.length).toBeGreaterThan(400);
    expect(live.punches.every((p) => Date.parse(p.occurredAt) <= NOW)).toBe(true);
    // Hoje já há entradas (turno da manhã), mas nada no futuro.
    expect(live.punches.some((p) => p.occurredAt.startsWith("2026-10-12"))).toBe(true);
    expect(out.summary.clockEvents).toBe(live.punches.length);
    expect(support.audits).toEqual([{ org: "org-real", action: "demo.organization.create", resourceId: out.demo.id }]);
  });

  test("ninguém pica nos dias de férias do cenário", async () => {
    const { live, scenario, uc } = setup();
    await uc.create(REAL, admin);
    const onLeave = scenario.plans[0]!.approved;
    expect(onLeave.length).toBe(2);
    for (const a of onLeave) expect(live.punches.some((p) => p.employeeId === a.employeeId && p.occurredAt.startsWith("2026-10-12"))).toBe(false);
  });

  test("atualizar acrescenta só o que falta (sem duplicar); automático no máximo de 10 em 10 minutos", async () => {
    const { live, scenario, uc, advance } = setup();
    await uc.create(REAL, admin);
    const before = live.punches.length;
    expect(await uc.refresh(REAL, admin)).toMatchObject({ skipped: false, punches: 0 });
    expect(await uc.refresh(REAL, admin)).toMatchObject({ skipped: true });
    advance(8 * 3_600_000); // 19:00 em Lisboa: saídas do turno da manhã, entradas da tarde
    const later = await uc.refresh(REAL, admin);
    expect(later.punches).toBeGreaterThan(0);
    expect(new Set(live.punches.map((p) => p.clientEventId)).size).toBe(live.punches.length);
    expect(live.punches.length).toBe(before + later.punches);
    expect(scenario.plans).toHaveLength(1);
  });

  test("demo criada antes do cenário: o primeiro refresh cria o cenário e o tipo de férias", async () => {
    const { repo, live, scenario, uc } = setup();
    repo.orgs.set("demo-old", { name: "Antiga — Demonstração", isDemo: true, demoOf: "org-real", nif: "DEMO-X" });
    const r = await uc.refresh(REAL, admin, { force: true });
    expect(r).toMatchObject({ skipped: false, scenario: true });
    expect(live.vacationEnsured).toBe(1);
    expect(scenario.plans).toHaveLength(1);
  });

  test("só Admin; não cria duas; não cria a partir de uma organização demo", async () => {
    const { uc } = setup();
    await expect(uc.create(REAL, { ...admin, isAdmin: false })).rejects.toMatchObject({ code: "admin_only" });
    const { demo } = await uc.create(REAL, admin);
    await expect(uc.create(REAL, admin)).rejects.toMatchObject({ code: "already_exists" });
    await expect(uc.create(demo.id, admin)).rejects.toMatchObject({ code: "is_demo" });
    await expect(uc.create(mintOrganizationId("org-x"), admin)).rejects.toMatchObject({ code: "not_found" });
    await expect(uc.refresh(mintOrganizationId("org-x"), admin)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("Marcações fictícias", () => {
  const ds = generateDemoDataset({ seed: 20261012, employeesPerCenter: 5, from: "2026-09-01", to: "2026-09-30" });
  const all = generatePunches({ seed: 20261012, employees: ds.employees, schedules: ds.schedules, from: "2026-09-01", to: "2026-09-30" });

  test("reprodutíveis por dia: o mesmo dia dá as mesmas marcações em qualquer período", () => {
    const one = generatePunches({ seed: 20261012, employees: ds.employees, schedules: ds.schedules, from: "2026-09-15", to: "2026-09-15" });
    expect(one.length).toBeGreaterThan(0);
    for (const p of one) expect(all.find((x) => x.clientEventId === p.clientEventId)).toEqual(p);
  });

  test("atrasos, faltas, pausas e esquecimentos em proporções realistas", () => {
    const scheduleOf = new Map(ds.schedules.map((s) => [s.key, s]));
    const ins = all.filter((p) => p.kind === "in");
    const late = ins.filter((p) => {
      const e = ds.employees.find((x) => x.key === p.employeeKey)!;
      const local = new Date(p.atUtc).toLocaleTimeString("en-GB", { timeZone: p.timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
      return local > scheduleOf.get(e.scheduleKey)!.start;
    }).length;
    expect(late / ins.length).toBeGreaterThan(0.05);
    expect(late / ins.length).toBeLessThan(0.25);
    expect(all.some((p) => p.kind === "break")).toBe(true);
    expect(all.filter((p) => p.kind === "out").length).toBeLessThan(ins.length);
    expect(new Set(all.map((p) => p.clientEventId)).size).toBe(all.length);
  });

  test("cenário: semanas publicadas, rascunho, férias hoje e pedidos pendentes", () => {
    const people = ds.employees.map((e) => ({ id: `db-${e.key}`, key: e.key, locationId: `loc-${e.centerKey}`, scheduleName: ds.schedules.find((s) => s.key === e.scheduleKey)!.name }));
    const plan = planScenario(people, ds.schedules, "2026-10-14");
    expect(plan.rosters).toHaveLength(4);
    expect(plan.rosters[0]).toMatchObject({ published: { from: "2026-10-05", to: "2026-10-18" }, draft: { from: "2026-10-19", to: "2026-10-25" } });
    expect(plan.rosters.flatMap((r) => r.groups.flatMap((g) => g.employeeIds))).toHaveLength(20);
    expect(plan.approved.every((a) => a.startDate === "2026-10-14")).toBe(true);
    expect(plan.pending).toHaveLength(3);
    expect(plan.pending.every((p) => p.startDate > "2026-10-14")).toBe(true);
    expect(plan.templates.map((t) => t.name)).toEqual(["Manhã", "Tarde", "Noite", "Fecho com limpeza"]);
    expect(keyFromEmail("ana.silva.t1-c1-e001@demo.invalid")).toBe("t1-c1-e001");
    expect(keyFromEmail("real@empresa.pt")).toBeNull();
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
    expect(plan.clockEvents.every((c) => ["work", "break_unpaid", "off"].includes(String(c.segment_type)))).toBe(true);
    expect(plan.assignments.filter((a) => a.resource_type === "schedule").every((a) => schedIds.has(a.resource_id) && empIds.has(a.target_id))).toBe(true);
    const pt = plan.locations.filter((l) => l.country === "PT").map((l) => l.id);
    expect(plan.assignments.filter((a) => a.resource_type === "holiday_calendar").map((a) => a.target_id).sort()).toEqual([...pt].sort());
    expect(plan.absenceTypes.some((t) => t.category === "vacation")).toBe(true);
  });

  test("horário noturno marcado como night, faixas por dia ISO", () => {
    expect(plan.scheduleVersions.some((v) => v.night === true)).toBe(true);
    for (const v of plan.scheduleVersions) for (const k of Object.keys(v.days as object)) expect(["1", "2", "3", "4", "5", "6", "7"]).toContain(k);
  });
});
