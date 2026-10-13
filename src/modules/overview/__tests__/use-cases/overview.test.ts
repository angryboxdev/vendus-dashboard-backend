import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { OverviewUseCases } from "../../application/use-cases/overview.use-cases.js";
import { classifyDay } from "../../domain/services/overview.service.js";
import { blankDay, FakeOverviewSources } from "../fakes/fake-overview.js";

const ORG = mintOrganizationId("org-a");
const all = { canSee: async () => true, canPrivate: false };

function setup() {
  const sources = new FakeOverviewSources();
  sources.todayOf = {
    "e-ana": { firstInAt: "2026-10-12T08:20:00Z", lateMinutes: 20, openType: "work", workedSeconds: 3600 },
    "e-rui": {},
    "e-eva": { excused: true },
    "e-joao": { startPassed: false },
  };
  sources.absencesList = [{ employeeId: "e-eva", typeName: "Férias", startDate: "2026-10-12", endDate: "2026-10-16" }];
  let t = 0;
  const uc = new OverviewUseCases(sources, () => t);
  return { sources, uc, advance: (ms: number) => (t += ms) };
}

describe("Painel do Novo RH", () => {
  test("só hoje (Dashboard): mesmos estados, apuramento de um só dia por pessoa, com âmbito", async () => {
    const { uc, sources } = setup();
    const o = await uc.today(ORG, { canSee: async (id) => id !== "e-joao", canPrivate: false });
    expect(sources.ranges.every((r) => r === "2026-10-12..2026-10-12")).toBe(true);
    const by = Object.fromEntries(o.people.map((p) => [p.name, p]));
    expect(by["Ana Demo"]).toMatchObject({ status: "working", lateMinutes: 20 });
    expect(by["Eva Demo"]!.status).toBe("absent");
    expect(o.people.some((p) => p.employeeId === "e-joao")).toBe(false);
  });

  test("estados do dia: a trabalhar com atraso, falta, ausência, ainda não começou", async () => {
    const { uc } = setup();
    const o = await uc.get(ORG, all, null);
    expect(o.date).toBe("2026-10-12");
    const by = Object.fromEntries(o.people.map((p) => [p.name, p]));
    expect(by["Ana Demo"]).toMatchObject({ status: "working", lateMinutes: 20, locationName: "Porto" });
    expect(by["Rui Demo"]!.status).toBe("missing");
    expect(by["Eva Demo"]).toMatchObject({ status: "absent", absenceType: "Férias" });
    expect(by["João Demo"]!.status).toBe("not_started");
    expect(o.kpis).toMatchObject({ people: 4, working: 1, missing: 1, absent: 1, late: 1, notStarted: 1 });
    // O que pede atenção primeiro: falta, depois atraso.
    expect(o.people.map((p) => p.name).slice(0, 2)).toEqual(["Rui Demo", "Ana Demo"]);
    expect(o.locations).toEqual([
      { locationId: "loc-braga", name: "Braga", people: 2, present: 0, absent: 1, missing: 0, late: 0 },
      { locationId: "loc-porto", name: "Porto", people: 2, present: 1, absent: 0, missing: 1, late: 1 },
    ]);
    expect(o.week).toHaveLength(7);
    expect(o.week[0]!.date).toBe("2026-10-06");
    expect(o.week.at(-1)).toMatchObject({ date: "2026-10-12", late: 1, missing: 1, absent: 1 });
    expect(by["Ana Demo"]!.week).toHaveLength(7);
    expect(o.pending.incidents).toBe(3);
    expect(o.holidays[0]!.name).toBe("Dia de Todos os Santos");
  });

  test("âmbito: só aparecem as pessoas que o utilizador pode ver (e os totais seguem-nas)", async () => {
    const { uc } = setup();
    const o = await uc.get(ORG, { canSee: async (id) => id === "e-ana", canPrivate: false }, null);
    expect(o.people.map((p) => p.employeeId)).toEqual(["e-ana"]);
    expect(o.kpis.people).toBe(1);
    expect(o.locations).toHaveLength(1);
  });

  test("cache de 30 s por organização e dia; datas inválidas e futuras recusadas", async () => {
    const { uc, sources, advance } = setup();
    await uc.get(ORG, all, null);
    await uc.get(ORG, all, "2026-10-12");
    expect(sources.daysCalls).toBe(4);
    advance(31_000);
    await uc.get(ORG, all, null);
    expect(sources.daysCalls).toBe(8);
    await expect(uc.get(ORG, all, "2026-13-01")).rejects.toThrow("Data inválida");
    await expect(uc.get(ORG, all, "2026-10-13")).rejects.toThrow("dias futuros");
  });

  test("dia passado sem marcação com horário é falta; sem horário é folga", () => {
    expect(classifyDay(blankDay("2026-10-10", { startPassed: false }), null, "2026-10-12")).toBe("missing");
    expect(classifyDay(blankDay("2026-10-10", { theoreticalSeconds: 0 }), null, "2026-10-12")).toBe("day_off");
    expect(classifyDay(blankDay("2026-10-10", { openType: "break_unpaid", firstInAt: "x" }), null, "2026-10-12")).toBe("break");
    expect(classifyDay(blankDay("2026-10-10", { firstInAt: "x" }), null, "2026-10-12")).toBe("finished");
  });

  test("faixas do dia escolhido para a linha do tempo", async () => {
    const { uc, sources } = setup();
    sources.todayOf["e-ana"] = { ...sources.todayOf["e-ana"], segments: [{ start: "2026-10-12T08:20:00Z", end: "2026-10-12T10:00:00Z", type: "work" }] };
    const o = await uc.get(ORG, all, null);
    expect(o.people.find((p) => p.employeeId === "e-ana")!.segments).toHaveLength(1);
  });

  test("horários planeados: até 14 dias, feriado vs. ausência, sem planeamento primeiro", async () => {
    const { uc, sources } = setup();
    sources.todayOf = { "e-eva": { excused: true }, "e-joao": { theoreticalSeconds: 0, plannedStart: null } };
    sources.daysPlan = { "e-joao": { theoreticalSeconds: 0, plannedStart: null, plannedEnd: null } };
    const plan = await uc.plan(ORG, all, "2026-10-13", "2026-10-14");
    expect(plan.people[0]!.name).toBe("João Demo");
    expect(plan.people[0]!.unplanned).toBe(true);
    const eva = plan.people.find((p) => p.employeeId === "e-eva")!;
    expect(eva.days.at(-1)).toMatchObject({ absenceType: "Férias", holiday: false });
    await expect(uc.plan(ORG, all, "2026-10-01", "2026-10-20")).rejects.toThrow("No máximo 14 dias");
    await expect(uc.plan(ORG, all, "2026-10-14", "2026-10-13")).rejects.toThrow("depois do início");
  });
});
