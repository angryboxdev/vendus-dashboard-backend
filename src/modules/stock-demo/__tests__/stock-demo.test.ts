import type { NextFunction, Request, Response } from "express";
import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";
import { daysBetween, dayRevenueCents, simulateDailySales } from "../domain/services/pos-sales.service.js";
import { DemoPosSalesUseCase, GetStockDemoStatusUseCase, ResolveStockDemoUseCase } from "../application/use-cases/stock-demo.use-cases.js";
import { StockDemoForbiddenError } from "../domain/ports/in/stock-demo.ports.js";
import type { PosCatalogReadPort, StockDemoRepositoryPort } from "../domain/ports/out/stock-demo.ports.js";
import type { PosProduct, StockDemoLink, StockDemoScenario } from "../domain/entities/stock-demo.js";
import { isStockDemoPath, stockDemoContext } from "../adapters/in/stock-demo-context.middleware.js";
import { DemoAwareSalesReadAdapter } from "../../stock-planning/adapters/out/demo-aware-sales-read.adapter.js";

// Dados fictícios.
const REAL = mintOrganizationId("org-real");
const DEMO = mintOrganizationId("org-demo-hamb");
const products: PosProduct[] = [
  { reference: "SMASH-I", title: "Smash (Individual)", pizzaId: "smash", size: "small", priceCents: 990 },
  { reference: "SMASH-G", title: "Smash (Grande)", pizzaId: "smash", size: "large", priceCents: 1390 },
  { reference: "BATATA", title: "Batata frita (Individual)", pizzaId: "batata", size: "small", priceCents: 450 },
  { reference: "SHAKE", title: "Milkshake (Individual)", pizzaId: "shake", size: "small", priceCents: 550 },
];
const link: StockDemoLink = { realOrgId: REAL, scenario: "hamburgueria", demoOrgId: DEMO, seed: 7, monthlySalesTargetCents: 6_000_000, posName: "CaixaFlow POS", posApiKeyHint: "demo-pos-••••7Q2K", createdAt: "2026-10-26T10:00:00Z" };

class FakeRepo implements StockDemoRepositoryPort {
  calls = 0;
  links: StockDemoLink[] = [link];
  async listForRealOrg(org: OrganizationId) { return this.links.filter((l) => l.realOrgId === org); }
  async findByScenario(org: OrganizationId, scenario: StockDemoScenario) { this.calls++; return this.links.find((l) => l.realOrgId === org && l.scenario === scenario) ?? null; }
  async findByDemoOrg(org: OrganizationId) { return this.links.find((l) => l.demoOrgId === org) ?? null; }
}
const catalog: PosCatalogReadPort = { listProducts: async () => products };

describe("CaixaFlow POS (fictício) — simulador de vendas", () => {
  const settings = { seed: 7, monthlySalesTargetCents: 6_000_000 };

  it("determinístico: o mesmo dia dá sempre as mesmas vendas", () => {
    expect(simulateDailySales(products, "2026-10-17", settings)).toEqual(simulateDailySales(products, "2026-10-17", settings));
  });

  it("30 dias ficam perto do alvo mensal (60 000 € ± 10%)", () => {
    const total = daysBetween("2026-09-01", "2026-09-30").flatMap((d) => simulateDailySales(products, d, settings)).reduce((s, x) => s + x.grossCents, 0);
    expect(total).toBeGreaterThan(5_400_000);
    expect(total).toBeLessThan(6_600_000);
  });

  it("sábado vende mais do que segunda", () => {
    expect(dayRevenueCents("2026-10-17", 7, 6_000_000)).toBeGreaterThan(dayRevenueCents("2026-10-12", 7, 6_000_000));
  });

  it("sem produtos com preço não há vendas; quantidades sempre inteiras e positivas", () => {
    expect(simulateDailySales([{ ...products[0]!, priceCents: 0 }], "2026-10-17", settings)).toEqual([]);
    for (const s of simulateDailySales(products, "2026-10-17", settings)) {
      expect(Number.isInteger(s.quantity)).toBe(true);
      expect(s.quantity).toBeGreaterThan(0);
      expect(s.grossCents).toBe(s.quantity * products.find((p) => p.reference === s.reference)!.priceCents);
    }
  });
});

describe("casos de uso da demonstração do Stock", () => {
  it("estado dos 3 cenários só para Admins", async () => {
    const uc = new GetStockDemoStatusUseCase(new FakeRepo());
    await expect(uc.execute({ realOrgId: REAL, isAdmin: false })).rejects.toBeInstanceOf(StockDemoForbiddenError);
    const { scenarios } = await uc.execute({ realOrgId: REAL, isAdmin: true });
    expect(scenarios.map((s) => [s.scenario, s.created])).toEqual([["brasileira", false], ["hamburgueria", true], ["bar", false]]);
    expect(scenarios[1]!.posName).toBe("CaixaFlow POS");
  });

  it("resolver usa cache de 60 s", async () => {
    const repo = new FakeRepo();
    let now = 0;
    const uc = new ResolveStockDemoUseCase(repo, () => now);
    expect(await uc.execute(REAL, "hamburgueria")).toBe(DEMO);
    expect(await uc.execute(REAL, "hamburgueria")).toBe(DEMO);
    expect(repo.calls).toBe(1);
    now = 61_000;
    await uc.execute(REAL, "hamburgueria");
    expect(repo.calls).toBe(2);
  });

  it("vendas do POS: só numa demo do Stock; a procura agrega por prato e variante", async () => {
    const uc = new DemoPosSalesUseCase(new FakeRepo(), catalog);
    expect(await uc.dailySales(REAL, "2026-10-17", "2026-10-17")).toBeNull();
    const sales = (await uc.dailySales(DEMO, "2026-10-17", "2026-10-17"))!;
    const demand = (await uc.dailyDemand(DEMO, "2026-10-17"))!;
    expect(demand.reduce((s, d) => s + d.quantitySold, 0)).toBe(sales.reduce((s, d) => s + d.quantity, 0));
    expect(demand.every((d) => d.demandSourceType === "pizza" && d.saleDate === "2026-10-17")).toBe(true);
  });

  it("planeamento: numa demo nunca chama a Vendus; numa empresa real chama", async () => {
    const real = { fetchDailyActuals: jest.fn(async () => [{ demandSourceType: "pizza" as const, demandSourceRef: "real:small", saleDate: "2026-10-17", quantitySold: 99 }]) };
    const adapter = new DemoAwareSalesReadAdapter(real, new DemoPosSalesUseCase(new FakeRepo(), catalog));
    const demoRows = await adapter.fetchDailyActuals(DEMO, "loc", "2026-10-17");
    expect(real.fetchDailyActuals).not.toHaveBeenCalled();
    expect(demoRows.length).toBeGreaterThan(0);
    await adapter.fetchDailyActuals(REAL, "loc", "2026-10-17");
    expect(real.fetchDailyActuals).toHaveBeenCalledTimes(1);
  });
});

describe("modo Demonstração do Stock (middleware)", () => {
  const run = async (opts: { path: string; method?: string; header?: string; isAdmin?: boolean; resolved?: OrganizationId | null }) => {
    const req = {
      path: opts.path,
      method: opts.method ?? "GET",
      auth: { orgId: REAL, sub: "u1", email: "admin@exemplo.invalid" },
      access: { isAdmin: opts.isAdmin ?? true },
      get: (h: string) => (h.toLowerCase() === "x-stock-demo" ? opts.header : undefined),
    } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;
    let error: unknown;
    const next = jest.fn((e?: unknown) => { error = e; }) as unknown as NextFunction;
    await stockDemoContext(async () => (opts.resolved === undefined ? DEMO : opts.resolved))(req, res, next);
    return { orgId: (req as unknown as { auth: { orgId: string } }).auth.orgId, error: error as { problem?: { status: number } } | undefined };
  };

  it("sem cabeçalho ou fora do Stock: nada muda (RH e restantes módulos intactos)", async () => {
    expect((await run({ path: "/api/stock/items" })).orgId).toBe(REAL);
    expect((await run({ path: "/api/novo-rh/people", header: "bar" })).orgId).toBe(REAL);
    expect((await run({ path: "/api/invoices", header: "bar" })).orgId).toBe(REAL);
    expect((await run({ path: "/api/locations", method: "POST", header: "bar" })).orgId).toBe(REAL);
  });

  it("rotas do Stock trocam para a organização fictícia", async () => {
    for (const path of ["/api/stock/items", "/api/pizzas", "/api/recipe-costing", "/api/stock-planning/items", "/api/reports/ingredient-consumption"]) {
      expect((await run({ path, header: "hamburgueria" })).orgId).toBe(DEMO);
    }
    expect((await run({ path: "/api/locations", header: "hamburgueria" })).orgId).toBe(DEMO);
  });

  it("recusas: importar faturas reais, não-Admin, cenário inexistente ou por criar", async () => {
    expect((await run({ path: "/api/invoices/import-for-stock", method: "POST", header: "bar" })).error?.problem?.status).toBe(403);
    expect((await run({ path: "/api/stock/items", header: "bar", isAdmin: false })).error?.problem?.status).toBe(403);
    expect((await run({ path: "/api/stock/items", header: "sushi" })).error?.problem?.status).toBe(400);
    expect((await run({ path: "/api/stock/items", header: "bar", resolved: null })).error?.problem?.status).toBe(409);
  });

  it("isStockDemoPath não apanha prefixos parecidos", () => {
    expect(isStockDemoPath("/api/stockpile", "GET")).toBe(false);
    expect(isStockDemoPath("/api/stock-count/sessions", "POST")).toBe(true);
  });
});
