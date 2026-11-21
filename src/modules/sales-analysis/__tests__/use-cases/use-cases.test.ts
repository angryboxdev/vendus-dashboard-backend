import { AirMenuFetchCoordinator, DailyAirMenuSync, VendusFillCoordinator } from "../../application/background-fills.js";
import {
  FetchAirMenuMonthUseCase, GetSalesAnalysisUseCase, GetSalesForecastUseCase, TodayVendusCache,
} from "../../application/use-cases/sales-analysis.use-cases.js";
import { SalesAnalysisValidationError } from "../../domain/entities/sales-analysis.js";
import { eachDay } from "../../domain/services/dates.js";
import { FakeClock, FakeModel, FakeSource, FakeStore, ORG } from "../fakes/fakes.js";

function setup(today = "2026-11-21") {
  const store = new FakeStore();
  const vendus = new FakeSource("salao");
  const air = new FakeSource("glovo", 3_000);
  const clock = new FakeClock(today);
  const fill = new VendusFillCoordinator(vendus, store, 7);
  const airJobs = new AirMenuFetchCoordinator(air, store, clock, 7, 0);
  const analysis = new GetSalesAnalysisUseCase(store, fill, new TodayVendusCache(vendus), airJobs, clock);
  const fetchMonth = new FetchAirMenuMonthUseCase(airJobs, clock);
  return { store, vendus, air, clock, fill, airJobs, analysis, fetchMonth };
}

describe("GetSalesAnalysisUseCase", () => {
  it("valida o período (ordem, futuro, máx. 12 meses)", async () => {
    const { analysis } = setup();
    await expect(analysis.execute({ organizationId: ORG, range: { from: "2026-11-10", to: "2026-11-01" }, source: "vendus" })).rejects.toBeInstanceOf(SalesAnalysisValidationError);
    await expect(analysis.execute({ organizationId: ORG, range: { from: "2026-11-01", to: "2026-11-22" }, source: "vendus" })).rejects.toThrow("depois de hoje");
    await expect(analysis.execute({ organizationId: ORG, range: { from: "2025-11-01", to: "2026-11-21" }, source: "vendus" })).rejects.toThrow("12 meses");
  });

  it("Vendus: pede em segundo plano só os dias fechados em falta das três janelas e hoje em direto", async () => {
    const { analysis, store, vendus, fill } = setup();
    // Já guardados: 1–10 de novembro.
    store.seed("vendus", { from: "2026-11-01", to: "2026-11-10" });
    const r = await analysis.execute({ organizationId: ORG, range: { from: "2026-11-01", to: "2026-11-21" }, source: "vendus" });
    // Em falta: 11–20 nov (10) + 1–21 nov 2025 (21) + 1–21 out (21) = 52.
    expect(r.vendus!.missingDays).toBe(52);
    expect(r.vendus!.todayLive).toBe(true);
    // Hoje veio em direto; os dias guardados também.
    expect(r.current.filter((b) => b[0] === "2026-11-21")).toHaveLength(1);
    expect(r.current.filter((b) => b[0] === "2026-11-05")).toHaveLength(1);
    await fill.idle(ORG);
    const fetchedDays = vendus.calls.flatMap((c) => eachDay(c));
    expect(fetchedDays).not.toContain("2026-11-05"); // já guardado → nunca pedido
    expect(store.covered.has("vendus|2026-11-20")).toBe(true);
    expect(store.covered.has("vendus|2026-11-21")).toBe(false); // hoje não se guarda
    // Segunda abertura: nada em falta.
    const r2 = await analysis.execute({ organizationId: ORG, range: { from: "2026-11-01", to: "2026-11-21" }, source: "vendus" });
    expect(r2.vendus!.missingDays).toBe(0);
  });

  it("devolve ano anterior e mês anterior como totais diários por canal", async () => {
    const { analysis, store } = setup();
    store.seed("vendus", { from: "2025-11-01", to: "2025-11-21" });
    store.seed("vendus", { from: "2026-10-01", to: "2026-10-21" });
    store.seed("vendus", { from: "2026-11-01", to: "2026-11-20" });
    const r = await analysis.execute({ organizationId: ORG, range: { from: "2026-11-01", to: "2026-11-20" }, source: "vendus" });
    expect(r.prevYearRange).toEqual({ from: "2025-11-01", to: "2025-11-20" });
    expect(r.prevYear).toHaveLength(20);
    expect(r.prevYear[0]![1]).toBe(-1);
    expect(r.prevMonth).toHaveLength(20);
    expect(r.channels).toEqual(["salao", "take_away", "eatz", "apps"]);
  });

  it("nunca chama a AirMenu ao abrir a página; mostra o estado de cada mês", async () => {
    const { analysis, store, air } = setup();
    store.seed("airmenu", { from: "2026-10-01", to: "2026-10-31" }, "glovo");
    store.seed("airmenu", { from: "2026-09-01", to: "2026-09-10" }, "glovo");
    const r = await analysis.execute({ organizationId: ORG, range: { from: "2026-08-01", to: "2026-11-21" }, source: "both" });
    expect(air.calls).toHaveLength(0);
    expect(r.airMenu!.months).toEqual([
      { month: "2026-08", state: "missing" },
      { month: "2026-09", state: "partial" },
      { month: "2026-10", state: "stored" },
      { month: "2026-11", state: "missing" },
    ]);
    expect(r.airMenu!.comparisonMissingMonths).toContain("2025-08");
  });
});

describe("FetchAirMenuMonthUseCase", () => {
  it("só pede à API os dias ainda não guardados (mais hoje) e guarda os fechados", async () => {
    const { fetchMonth, airJobs, store, air } = setup();
    store.seed("airmenu", { from: "2026-11-01", to: "2026-11-15" }, "glovo");
    const s = await fetchMonth.execute({ organizationId: ORG, month: "2026-11" });
    expect(s.state).toBe("queued");
    await airJobs.idle(ORG, "2026-11");
    expect(air.calls).toEqual([{ from: "2026-11-16", to: "2026-11-21" }]);
    expect(store.covered.has("airmenu|2026-11-20")).toBe(true);
    expect(store.covered.has("airmenu|2026-11-21")).toBe(false);
    expect(airJobs.todayBuckets(ORG)).toHaveLength(1);
  });

  it("um mês passado já guardado não faz nenhum pedido à API", async () => {
    const { fetchMonth, airJobs, store, air } = setup();
    store.seed("airmenu", { from: "2026-07-01", to: "2026-07-31" }, "glovo");
    await fetchMonth.execute({ organizationId: ORG, month: "2026-07" });
    await airJobs.idle(ORG, "2026-07");
    expect(air.calls).toHaveLength(0);
  });

  it("falha da AirMenu não guarda nada e fica em erro", async () => {
    const { fetchMonth, airJobs, store, air } = setup();
    air.fail = true;
    await fetchMonth.execute({ organizationId: ORG, month: "2026-07" });
    await airJobs.idle(ORG, "2026-07");
    expect(store.saveCalls).toHaveLength(0);
    expect(airJobs.status(ORG, "2026-07")!.state).toBe("error");
  });

  it("busca um mês uma semana de cada vez e guarda cada semana", async () => {
    const { fetchMonth, airJobs, store, air } = setup();
    await fetchMonth.execute({ organizationId: ORG, month: "2026-07" });
    await airJobs.idle(ORG, "2026-07");
    expect(air.calls).toEqual([
      { from: "2026-07-01", to: "2026-07-07" },
      { from: "2026-07-08", to: "2026-07-14" },
      { from: "2026-07-15", to: "2026-07-21" },
      { from: "2026-07-22", to: "2026-07-28" },
      { from: "2026-07-29", to: "2026-07-31" },
    ]);
    expect(store.saveCalls).toHaveLength(5);
  });

  it("vários meses pedidos ficam na fila e são buscados um de cada vez", async () => {
    const { fetchMonth, airJobs, air } = setup();
    expect((await fetchMonth.execute({ organizationId: ORG, month: "2026-07" })).state).toBe("queued");
    expect((await fetchMonth.execute({ organizationId: ORG, month: "2026-08" })).state).toBe("queued");
    expect((await fetchMonth.execute({ organizationId: ORG, month: "2026-09" })).state).toBe("queued");
    await airJobs.idle(ORG, "2026-09");
    expect(air.maxInFlight).toBe(1);
    expect(air.calls.map((c) => c.from.slice(0, 7))).toEqual([
      "2026-07", "2026-07", "2026-07", "2026-07", "2026-07",
      "2026-08", "2026-08", "2026-08", "2026-08", "2026-08",
      "2026-09", "2026-09", "2026-09", "2026-09", "2026-09",
    ]);
  });

  it("falha a meio: as semanas que vieram ficam guardadas e não voltam a ser pedidas", async () => {
    const { fetchMonth, airJobs, store, air } = setup();
    air.failOnCall = 3;
    await fetchMonth.execute({ organizationId: ORG, month: "2026-07" });
    await airJobs.idle(ORG, "2026-07");
    expect(airJobs.status(ORG, "2026-07")!.state).toBe("error");
    expect(store.covered.has("airmenu|2026-07-14")).toBe(true);
    expect(store.covered.has("airmenu|2026-07-15")).toBe(false);
    air.failOnCall = null;
    air.calls = [];
    await fetchMonth.execute({ organizationId: ORG, month: "2026-07" });
    await airJobs.idle(ORG, "2026-07");
    expect(air.calls[0]).toEqual({ from: "2026-07-15", to: "2026-07-21" });
  });

  it("espera entre semanas (pausa configurável)", async () => {
    const store = new FakeStore();
    const air = new FakeSource("glovo");
    const pauses: number[] = [];
    const jobs = new AirMenuFetchCoordinator(air, store, new FakeClock("2026-11-21"), 7, 15_000, async (ms) => { pauses.push(ms); });
    jobs.start(ORG, "2026-07");
    await jobs.idle(ORG, "2026-07");
    expect(pauses).toEqual([15_000, 15_000, 15_000, 15_000]);
  });

  it("recusa mês inválido ou futuro", async () => {
    const { fetchMonth } = setup();
    await expect(fetchMonth.execute({ organizationId: ORG, month: "2026-13" })).rejects.toBeInstanceOf(SalesAnalysisValidationError);
    await expect(fetchMonth.execute({ organizationId: ORG, month: "2026-12" })).rejects.toThrow("futuro");
  });
});

describe("GetSalesForecastUseCase", () => {
  function forecastSetup(model: FakeModel) {
    const base = setup("2026-11-28");
    const uc = new GetSalesForecastUseCase(base.store, base.fill, model, base.clock);
    return { ...base, uc };
  }

  it("sem histórico guardado pede o preenchimento e responde «pending»", async () => {
    const { uc } = forecastSetup(new FakeModel(false));
    const r = await uc.execute({ organizationId: ORG, source: "vendus" });
    expect(r.status).toBe("pending");
  });

  it("sem IA usa a regra de base e assinala-o", async () => {
    const { uc, store } = forecastSetup(new FakeModel(false));
    store.seed("vendus", { from: "2025-11-01", to: "2026-11-27" });
    const r = await uc.execute({ organizationId: ORG, source: "vendus" });
    if (r.status !== "ready") throw new Error("esperado ready");
    expect(r.forecast.method).toBe("baseline");
    expect(r.forecast.days.map((d) => d.date)).toEqual(["2026-11-28", "2026-11-29", "2026-11-30"]);
    expect(r.forecast.actualCents).toBe(27 * 10_000);
    expect(r.forecast.expectedTotalCents).toBe(30 * 10_000);
  });

  it("com IA válida usa a resposta da IA e guarda-a para o dia", async () => {
    const model = new FakeModel(true, () =>
      JSON.stringify({ days: ["2026-11-28", "2026-11-29", "2026-11-30"].map((date) => ({ date, expected: 120, low: 90, high: 150, count: 5 })) }));
    const { uc, store } = forecastSetup(model);
    store.seed("vendus", { from: "2025-11-01", to: "2026-11-27" });
    const r = await uc.execute({ organizationId: ORG, source: "vendus" });
    if (r.status !== "ready") throw new Error("esperado ready");
    expect(r.forecast.method).toBe("ai");
    expect(r.forecast.days[0]!.expectedCents).toBe(12_000);
    expect(model.prompts[0]).not.toMatch(/NIF|cliente:/i);
    await uc.execute({ organizationId: ORG, source: "vendus" });
    expect(model.prompts).toHaveLength(1); // cache do dia
  });
});

describe("DailyAirMenuSync (busca diária do dia anterior)", () => {
  function daily(hour: number) {
    const store = new FakeStore();
    const air = new FakeSource("glovo");
    const clock = new FakeClock("2026-11-22", hour);
    const jobs = new AirMenuFetchCoordinator(air, store, clock, 7, 0);
    return { store, air, clock, jobs, sync: new DailyAirMenuSync(jobs, store, clock, ORG, 5) };
  }

  it("antes das 5h não faz nada", async () => {
    const { sync, air } = daily(3);
    expect(await sync.tick()).toBeNull();
    expect(air.calls).toHaveLength(0);
  });

  it("depois das 5h busca só o dia anterior, uma vez por dia", async () => {
    const { sync, air, jobs, store } = daily(6);
    expect(await sync.tick()).toBe("2026-11-21");
    await jobs.drained();
    expect(air.calls).toEqual([{ from: "2026-11-21", to: "2026-11-21" }]);
    expect(store.covered.has("airmenu|2026-11-21")).toBe(true);
    expect(await sync.tick()).toBeNull(); // segundo tick no mesmo dia
    expect(air.calls).toHaveLength(1);
  });

  it("se o dia anterior já estiver guardado, não pede nada", async () => {
    const { sync, air, store } = daily(6);
    store.seed("airmenu", { from: "2026-11-21", to: "2026-11-21" }, "glovo");
    expect(await sync.tick()).toBeNull();
    expect(air.calls).toHaveLength(0);
  });
});
