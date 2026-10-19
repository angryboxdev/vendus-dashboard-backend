import { randomUUID } from "node:crypto";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { buildSeedPlan } from "../../adapters/out/demo-seed.rows.js";
import { DemoOrgUseCases } from "../../application/use-cases/demo-org.use-cases.js";
import { generateDemoDataset, generatePunches } from "../../domain/services/demo-dataset.generator.js";
import { keyFromEmail, planCurrent, planEnrichment, planScenario } from "../../domain/services/demo-scenario.js";
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
    expect(await uc.status(REAL)).toMatchObject({ exists: false, name: null, refresh: { running: false, lastAt: null } });
    const out = await uc.create(REAL, admin);
    expect(out.demo.name).toBe("Mezza — Demonstração");
    expect(repo.orgs.get(out.demo.id)).toMatchObject({ isDemo: true, demoOf: "org-real", nif: "DEMO-ORG-REAL" });
    expect(seeder.seeded[0]!.dataset.employees).toHaveLength(112); // 4 centros × 28
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
    // Demos antigas ganham as fotos fictícias; quem já tem foto não muda.
    expect(live.photos.size).toBe((await live.employees()).length);
    expect([...live.photos.values()].every((p) => /^demo-avatars\/[fm]-\d{2}\.svg$/.test(p))).toBe(true);
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

describe("Demonstração mais rica (apresentações)", () => {
  test("plano: mês anterior a fechar, regras de alerta, pedidos extra no futuro e aniversários (seis nas próximas 3 semanas)", () => {
    const people = Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, key: `t1-c1-e${String(i).padStart(3, "0")}`, locationId: "l1", scheduleName: "Manhã" }));
    const p = planEnrichment(people, "2026-10-13");
    expect(p.closePeriod).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(p.alertRules.map((r) => r.kind)).toContain("pending_absence");
    expect(p.extraPending.length).toBeGreaterThan(0);
    expect(p.extraPending.every((x) => x.startDate > "2026-11-02")).toBe(true);
    const soon = p.birthDates.filter((b) => {
      const md = b.birthDate.slice(5);
      return md >= "10-13" && md <= "11-03";
    });
    expect(soon.length).toBeGreaterThanOrEqual(6);
    expect(p.birthDates.every((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.birthDate) && Number(b.birthDate.slice(0, 4)) < 2005)).toBe(true);
    expect(p.birthDates.some((b) => b.birthDate.endsWith("-02-29") && Number(b.birthDate.slice(0, 4)) % 4 !== 0)).toBe(false);
  });

  test("refresh: marca aniversários a quem não tem e pede o enriquecimento (só cria o que falta do lado de quem aplica)", async () => {
    const { repo, live, scenario, uc } = setup();
    repo.orgs.set("demo-x", { name: "Demo — Demonstração", isDemo: true, demoOf: "org-real", nif: "DEMO-Y" });
    await uc.refresh(REAL, admin, { force: true });
    expect(live.births.size).toBe((await live.employees()).length);
    expect(scenario.enrichments).toHaveLength(1);
    expect(scenario.enrichments[0]!.closePeriod.startDate).toBe("2026-09-01");
  });
});

describe("Demonstração maior e com mais movimento (2026-10-19)", () => {
  test("mais de 100 colaboradores; os 20 de sempre ficam iguais (demos já criadas não mudam)", () => {
    const old = generateDemoDataset({ seed: 20261012, employeesPerCenter: 5, from: "2026-10-12", to: "2026-10-12" }).employees;
    const now = generateDemoDataset({ seed: 20261012, employeesPerCenter: 28, from: "2026-10-12", to: "2026-10-12" }).employees;
    expect(now).toHaveLength(112);
    expect(now.slice(0, 20)).toEqual(old);
    expect(new Set(now.map((e) => e.key)).size).toBe(112);
    expect(new Set(now.map((e) => e.email)).size).toBe(112);
  });

  test("uma demo antiga (20) cresce no refresh: só acrescenta quem falta, e o cenário fica em dia", async () => {
    const { live, scenario, uc } = setup();
    await uc.create(REAL, admin);
    expect(live.added).toHaveLength(92); // 112 − 20 que a demo «antiga» já tinha
    expect(live.added.every((e) => Number(e.key.slice(-3)) > 5)).toBe(true);
    // Os acrescentados também picam ponto.
    const addedIds = new Set(live.added.map((e) => `db-${e.key}`));
    expect(live.punches.some((p) => addedIds.has(p.employeeId))).toBe(true);
    await uc.refresh(REAL, admin, { force: true });
    expect(live.added).toHaveLength(92); // não duplica
    expect(scenario.currents.length).toBeGreaterThanOrEqual(2);
    expect(scenario.currents[0]!.rosters.flatMap((r) => r.groups.flatMap((g) => g.employeeIds))).toHaveLength(112);
  });

  test("em dia: ~6% de ausências hoje (estáveis por pessoa e dia), semana atual e seguinte", () => {
    const ds = generateDemoDataset({ seed: 20261012, employeesPerCenter: 28, from: "2026-10-19", to: "2026-10-19" });
    const people = ds.employees.map((e) => ({ id: e.key, key: e.key, locationId: e.centerKey, scheduleName: ds.schedules.find((s) => s.key === e.scheduleKey)!.name }));
    const plan = planCurrent(people, ds.schedules, "2026-10-21");
    expect(plan.weeks).toEqual({ current: { from: "2026-10-19", to: "2026-10-25" }, next: { from: "2026-10-26", to: "2026-11-01" } });
    expect(plan.absencesToday.length).toBeGreaterThan(2);
    expect(plan.absencesToday.length).toBeLessThan(15);
    expect(plan.absencesToday.every((a) => a.startDate === "2026-10-21" && a.endDate >= a.startDate)).toBe(true);
    expect(planCurrent(people, ds.schedules, "2026-10-21")).toEqual(plan);
  });

  test("mais movimento: saídas e voltas curtas e saídas antecipadas, sempre dentro do turno e por ordem", () => {
    const ds = generateDemoDataset({ seed: 20261012, employeesPerCenter: 28, from: "2026-10-01", to: "2026-10-01" });
    const punches = generatePunches({ seed: 20261012, employees: ds.employees, schedules: ds.schedules, from: "2026-09-01", to: "2026-09-30" });
    const ins = punches.filter((p) => p.kind === "in");
    const steps = punches.filter((p) => p.kind === "step_out");
    expect(steps.length / ins.length).toBeGreaterThan(0.2);
    expect(steps.length / ins.length).toBeLessThan(0.45);
    // Por pessoa e dia: entrada antes de tudo, saída depois de tudo, cada «volta» depois da sua saída.
    const byDay = new Map<string, typeof punches>();
    for (const p of punches) byDay.set(`${p.employeeKey}|${p.workDate}`, [...(byDay.get(`${p.employeeKey}|${p.workDate}`) ?? []), p]);
    for (const list of byDay.values()) {
      const at = (k: string) => list.find((p) => p.kind === k)?.atUtc;
      const first = at("in")!;
      for (const p of list) expect(p.atUtc >= first).toBe(true);
      if (at("out")) for (const p of list) expect(p.atUtc <= at("out")!).toBe(true);
      if (at("step_out")) expect(at("step_in")! > at("step_out")!).toBe(true);
      if (at("step_in") && at("break")) expect(at("step_in")! < at("break")!).toBe(true);
    }
  });
});
