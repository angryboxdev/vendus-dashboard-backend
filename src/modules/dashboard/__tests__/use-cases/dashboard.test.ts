import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { MemoryDashboardCache } from "../../adapters/out/memory-dashboard-cache.js";
import { DashboardForbiddenError, DashboardUseCases, DashboardValidationError, nextBirthday } from "../../application/use-cases/dashboard.use-cases.js";
import { attentionItems, mergeLayout, teamCounts, unitRows, validateLayout, WIDGET_SPECS } from "../../domain/services/snapshot.service.js";
import { FakeLayouts, FakeSources, FakeViewer, person, request } from "../fakes/fake-dashboard.js";

const ORG_A = mintOrganizationId("org-a");
const ORG_B = mintOrganizationId("org-b");

function setup(now = () => 1_000_000) {
  const sources = new FakeSources();
  const layouts = new FakeLayouts();
  const cache = new MemoryDashboardCache(now);
  return { sources, layouts, cache, uc: new DashboardUseCases(sources, layouts, cache) };
}

const PEOPLE = [
  person({ employeeId: "e1", status: "working" }),
  person({ employeeId: "e2", status: "remote" }),
  person({ employeeId: "e3", status: "break", lateMinutes: 12 }),
  person({ employeeId: "e4", status: "absent", absenceCategory: "vacation", absenceType: "Férias" }),
  person({ employeeId: "e5", status: "absent", absenceCategory: null, absenceType: "Ausência" }),
  person({ employeeId: "e6", status: "missing", locationId: "loc-b", locationName: "Loja B" }),
  person({ employeeId: "e7", status: "finished", locationId: "loc-b", locationName: "Loja B" }),
];

describe("Dashboard — regras puras", () => {
  test("estado da equipa mapeia estados reais (férias = ausência vacation; falta conta em ausentes; já saiu e por entrar contam)", () => {
    expect(teamCounts(PEOPLE)).toEqual({ total: 7, working: 1, remote: 1, break: 1, finished: 1, not_started: 0, vacation: 1, absent: 2, late: 1, missing: 1 });
  });

  test("requer atenção: só linhas com contagem, do crítico ao menos grave", () => {
    const items = attentionItems(teamCounts(PEOPLE), 2, [request({ key: "leave:1", employeeId: "e1" }), request({ key: "custom:2", employeeId: "e2", type: "custom" }), request({ key: "leave:3", employeeId: "e3", canDecide: false })]);
    expect(items.map((i) => [i.key, i.severity, i.count])).toEqual([
      ["missing", "critical", 1],
      ["uncovered", "critical", 2],
      ["absences_review", "urgent", 1],
      ["late", "attention", 1],
      ["requests", "attention", 1],
    ]);
    expect(attentionItems(teamCounts([person({ employeeId: "x" })]), 0, [])).toEqual([]);
  });

  test("estado das unidades: uma passagem, estado derivado e ordenado por gravidade", () => {
    const rows = unitRows(PEOPLE, [{ employeeId: "e1", name: "x", locationId: "loc-a", date: "2026-10-13" }], [], "2026-10-13", [
      { id: "loc-a", name: "Loja A" },
      { id: "loc-b", name: "Loja B" },
    ]);
    expect(rows.map((r) => [r.name, r.state, r.present, r.late, r.absent, r.missing, r.uncovered])).toEqual([
      ["Loja A", "critical", 3, 1, 2, 0, 1],
      ["Loja B", "critical", 1, 0, 0, 1, 0],
    ]);
  });

  test("layout: valida ids e tamanhos; novos widgets entram sem apagar preferências; removidos são ignorados", () => {
    expect(() => validateLayout({ widgets: [{ widgetId: "NOPE", span: 6 }] })).toThrow();
    expect(() => validateLayout({ widgets: [{ widgetId: "TEAM_STATUS", span: 3 }] })).toThrow();
    expect(() => validateLayout({ widgets: [{ widgetId: "TEAM_STATUS", span: 6 }, { widgetId: "TEAM_STATUS", span: 6 }] })).toThrow();
    // Guardado antes de existir ARTICLES, com um widget que entretanto saiu do produto.
    const before = WIDGET_SPECS.filter((w) => w.id !== "ARTICLES" && w.id !== "REQUESTS").map((w, i) => ({ widgetId: w.id, order: i + 1, span: w.defaultSpan, hidden: false }));
    const merged = mergeLayout({ layoutVersion: 1, widgets: [{ widgetId: "REQUESTS", order: 0, span: 12, hidden: true }, ...before, { widgetId: "OLD_WIDGET", order: 99, span: 4, hidden: false }] });
    expect(merged.widgets[0]).toEqual({ widgetId: "REQUESTS", order: 0, span: 12, hidden: true });
    expect(merged.widgets).toHaveLength(WIDGET_SPECS.length);
    expect(merged.widgets.some((w) => w.widgetId === "OLD_WIDGET")).toBe(false);
    expect(merged.widgets.at(-1)!.widgetId).toBe("ARTICLES");
  });

  test("layout: formato do gráfico só no Estado da equipa e só valores conhecidos; layouts antigos continuam válidos", () => {
    const l = validateLayout({
      widgets: [
        { widgetId: "TEAM_STATUS", span: 6, chart: "bar" },
        { widgetId: "ATTENTION", span: 6, chart: "pie" },
        { widgetId: "LOCATIONS_STATUS", span: 12, chart: "x" },
      ],
    });
    expect(l.widgets).toEqual([
      { widgetId: "TEAM_STATUS", order: 0, span: 6, hidden: false, chart: "bar" },
      { widgetId: "ATTENTION", order: 1, span: 6, hidden: false },
      { widgetId: "LOCATIONS_STATUS", order: 2, span: 12, hidden: false },
    ]);
    expect(validateLayout({ widgets: [{ widgetId: "TEAM_STATUS", span: 6, chart: "radar" }] }).widgets[0]).not.toHaveProperty("chart");
    // Sem layout guardado: linha principal equipa → unidades → atenção, em três colunas.
    expect(mergeLayout(null).widgets.slice(0, 3).map((w) => [w.widgetId, w.span])).toEqual([["TEAM_STATUS", 4], ["LOCATIONS_STATUS", 4], ["ATTENTION", 4]]);
    // Com layout guardado, a ordem de quem personalizou não muda.
    const mine = mergeLayout({ layoutVersion: 1, widgets: WIDGET_SPECS.map((w, i) => ({ widgetId: w.id, order: WIDGET_SPECS.length - i, span: 12, hidden: false })) });
    expect(mine.widgets[0]!.widgetId).toBe(WIDGET_SPECS.at(-1)!.id);
  });

  test("aniversário seguinte (29/02 em ano comum → 28/02; já passou → próximo ano)", () => {
    expect(nextBirthday("1990-10-20", "2026-10-13")).toBe("2026-10-20");
    expect(nextBirthday("1990-01-05", "2026-10-13")).toBe("2027-01-05");
    expect(nextBirthday("1992-02-29", "2026-10-13")).toBe("2027-02-28");
  });
});

describe("Dashboard — snapshot", () => {
  test("um só agregado alimenta resumo, atenção, equipa, cobertura, pedidos e unidades", async () => {
    const { uc, sources } = setup();
    sources.gaps = [
      { employeeId: "e1", name: "x", locationId: "loc-a", date: "2026-10-13" },
      { employeeId: "e2", name: "y", locationId: "loc-a", date: "2026-10-14" },
    ];
    const viewer = new FakeViewer("u1", PEOPLE, [request({ key: "leave:1", employeeId: "e1" })]);
    const s = await uc.snapshot(ORG_A, viewer, null);
    expect(s.context).toEqual({ type: "organization", locationId: null, name: null });
    expect(s.team.total).toBe(7);
    expect(s.coverage).toEqual({ uncoveredToday: 1, uncoveredTomorrow: 1, uncoveredTotal: 2 });
    expect(s.requests).toEqual({ pending: 1, decidable: 1 });
    expect(s.units).toEqual({ operational: 2, requiringAttention: 2 });
    expect(s.holidays[0]!.name).toBe("Todos os Santos");
  });

  test("contexto de um local filtra tudo; local fora do âmbito é recusado", async () => {
    const { uc } = setup();
    const viewer = new FakeViewer("u1", PEOPLE);
    const s = await uc.snapshot(ORG_A, viewer, "loc-b");
    expect(s.context.name).toBe("Loja B");
    expect(s.locations.map((l) => l.locationId)).toEqual(["loc-b"]);
    expect(s.team.total).toBe(2);
    expect(s.team.missing).toBe(1);
    expect(s.team.finished).toBe(1);
    await expect(uc.snapshot(ORG_A, viewer, "loc-zzz")).rejects.toBeInstanceOf(DashboardValidationError);
  });

  test("cache: segunda leitura não volta às fontes; isolada por organização e por quem consulta", async () => {
    const { uc, sources } = setup();
    const v1 = new FakeViewer("u1", PEOPLE);
    await uc.snapshot(ORG_A, v1, null);
    const again = await uc.snapshot(ORG_A, v1, "loc-a");
    expect(v1.peopleCalls).toBe(1);
    expect(sources.coverageCalls).toBe(1);
    expect(again.cacheHits).toBe(3);
    // Outro tenant e outro utilizador (outro âmbito) nunca leem a cache do primeiro.
    const restricted = new FakeViewer("u2", PEOPLE, [], false, (id) => id === "e6");
    expect((await uc.snapshot(ORG_A, restricted, null)).locations.map((l) => l.locationId)).toEqual(["loc-b"]);
    const otherOrg = new FakeViewer("u1", [person({ employeeId: "z1", locationId: "loc-z", locationName: "Loja Z" })]);
    expect((await uc.snapshot(ORG_B, otherOrg, null)).locations.map((l) => l.name)).toEqual(["Loja Z"]);
  });

  test("invalidação seletiva: só as métricas afetadas da organização", async () => {
    const { uc, cache } = setup();
    const v = new FakeViewer("u1", PEOPLE);
    await uc.snapshot(ORG_A, v, null);
    cache.invalidate(ORG_B, ["PEOPLE", "REQUESTS", "COVERAGE"]);
    await uc.snapshot(ORG_A, v, null);
    expect(v.peopleCalls).toBe(1);
    cache.invalidate(ORG_A, ["REQUESTS"]);
    await uc.snapshot(ORG_A, v, null);
    expect([v.peopleCalls, v.requestsCalls]).toEqual([1, 2]);
  });

  test("TTL: passado o tempo, volta a carregar", async () => {
    let t = 0;
    const { uc } = setup(() => t);
    const v = new FakeViewer("u1", PEOPLE);
    await uc.snapshot(ORG_A, v, null);
    t += 60_000;
    await uc.snapshot(ORG_A, v, null);
    expect(v.peopleCalls).toBe(2);
  });
});

describe("Dashboard — drill-down, aniversários e layout", () => {
  test("lista de uma categoria só tem essa categoria; tipo de ausência só em ausências", async () => {
    const { uc } = setup();
    const v = new FakeViewer("u1", PEOPLE);
    const working = await uc.team(ORG_A, v, { category: "working", locationId: null, q: "", page: 1 });
    expect(working.items.map((i) => i.employeeId)).toEqual(["e1"]);
    expect(working.items[0]!.absenceType).toBeNull();
    const vacation = await uc.team(ORG_A, v, { category: "vacation", locationId: null, q: "", page: 1 });
    expect(vacation.items.map((i) => [i.employeeId, i.absenceType])).toEqual([["e4", "Férias"]]);
    await expect(uc.team(ORG_A, v, { category: "everyone", locationId: null, q: "", page: 1 })).rejects.toBeInstanceOf(DashboardValidationError);
  });

  test("aniversários: sem permissão → 403; com permissão só dia/mês, no âmbito, próximos 30 dias", async () => {
    const { uc, sources } = setup();
    sources.births = [
      { employeeId: "e1", name: "Ana", locationName: "Loja A", birthDate: "1990-10-20" },
      { employeeId: "e2", name: "Rui", locationName: "Loja A", birthDate: "1985-12-25" },
      { employeeId: "e9", name: "Fora", locationName: "Loja Z", birthDate: "1990-10-15" },
    ];
    await expect(uc.birthdays(ORG_A, new FakeViewer("u1", PEOPLE))).rejects.toBeInstanceOf(DashboardForbiddenError);
    const v = new FakeViewer("u1", PEOPLE, [], true, (id) => id !== "e9");
    const out = await uc.birthdays(ORG_A, v);
    expect(out).toEqual([{ employeeId: "e1", name: "Ana", locationName: "Loja A", day: 20, month: 10, date: "2026-10-20" }]);
    expect(JSON.stringify(out)).not.toContain("1990");
  });

  test("layout pessoal: guardar, ler, outro utilizador não é afetado, restaurar padrão", async () => {
    const { uc } = setup();
    expect((await uc.layout(ORG_A, "u1")).custom).toBe(false);
    const rest = WIDGET_SPECS.filter((w) => w.id !== "REQUESTS" && w.id !== "TEAM_STATUS").map((w, i) => ({ widgetId: w.id, order: i + 2, span: w.defaultSpan, hidden: false }));
    const saved = await uc.saveLayout(ORG_A, "u1", { widgets: [{ widgetId: "REQUESTS", order: 0, span: 12, hidden: false }, { widgetId: "TEAM_STATUS", order: 1, span: 6, hidden: true }, ...rest] });
    expect(saved.custom).toBe(true);
    expect(saved.widgets.slice(0, 2).map((w) => [w.widgetId, w.span, w.hidden])).toEqual([["REQUESTS", 12, false], ["TEAM_STATUS", 6, true]]);
    expect((await uc.layout(ORG_A, "u2")).custom).toBe(false);
    await expect(uc.saveLayout(ORG_A, "u1", { widgets: [{ widgetId: "X", span: 1 }] })).rejects.toBeInstanceOf(DashboardValidationError);
    expect((await uc.resetLayout(ORG_A, "u1")).custom).toBe(false);
  });
});

describe("Dashboard — resiliência", () => {
  test("pedidos ou cobertura a falhar não derrubam o snapshot: saem vazios e assinalados em `partial`", async () => {
    const sources = new FakeSources();
    sources.coverage = async () => {
      throw new Error("horário em falta");
    };
    const errors: string[] = [];
    const uc = new DashboardUseCases(sources, new FakeLayouts(), new MemoryDashboardCache(), (src) => errors.push(src));
    const viewer = new FakeViewer("u1", PEOPLE);
    viewer.requests = async () => {
      throw new Error("caixa indisponível");
    };
    const s = await uc.snapshot(ORG_A, viewer, null);
    expect(s.team.total).toBe(7);
    expect(s.partial.sort()).toEqual(["coverage", "requests"]);
    expect(s.coverage.uncoveredTotal).toBe(0);
    expect(errors.sort()).toEqual(["coverage", "requests"]);
  });

  test("cobertura lenta: passa o tempo máximo e o snapshot sai sem ela", async () => {
    const sources = new FakeSources();
    sources.coverage = () => new Promise(() => {});
    const uc = new DashboardUseCases(sources, new FakeLayouts(), new MemoryDashboardCache(), () => {}, 20);
    const s = await uc.snapshot(ORG_A, new FakeViewer("u1", PEOPLE), null);
    expect(s.partial).toEqual(["coverage"]);
  });
});

describe("Dashboard — rapidez", () => {
  test("pessoas a demorar: responde 'a preparar' (sem pendurar) e o pedido seguinte aproveita o cálculo em curso", async () => {
    const { DashboardWarmingError } = await import("../../application/use-cases/dashboard.use-cases.js");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const viewer = new FakeViewer("u1", PEOPLE);
    const real = viewer.people.bind(viewer);
    viewer.people = async () => (await gate, real());
    const uc = new DashboardUseCases(new FakeSources(), new FakeLayouts(), new MemoryDashboardCache(), () => {}, 8000, 20);
    await expect(uc.snapshot(ORG_A, viewer, null)).rejects.toBeInstanceOf(DashboardWarmingError);
    release();
    await new Promise((r) => setTimeout(r, 5));
    expect((await uc.snapshot(ORG_A, viewer, null)).team.total).toBe(7);
    expect(viewer.peopleCalls).toBe(1);
  });

  test("depois do TTL serve o último valor já e atualiza em segundo plano; invalidação obriga a recalcular", async () => {
    let t = 0;
    const cache = new MemoryDashboardCache(() => t);
    const key = { org: ORG_A, metric: "PEOPLE" as const, date: "d", viewer: "u", context: "organization" };
    let n = 0;
    const load = async () => ++n;
    expect((await cache.getOrLoad(key, 1000, load)).value).toBe(1);
    t += 2000;
    expect((await cache.getOrLoad(key, 1000, load)).value).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect((await cache.getOrLoad(key, 1000, load)).value).toBe(2);
    cache.invalidate(ORG_A, ["PEOPLE"]);
    expect((await cache.getOrLoad(key, 1000, load)).value).toBe(3);
  });
});
