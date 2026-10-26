import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";
import { buildStockDemoPlan, demoUuid, type Row, type StockDemoPlan } from "../domain/services/demo-plan.service.js";
import { STOCK_DEMO_SCENARIO_DEFS, STOCK_DEMO_SEEDS } from "../domain/services/scenarios/index.js";
import { CreateStockDemoUseCase, lisbonToday, ResetStockDemoUseCase } from "../application/use-cases/stock-demo-seed.use-cases.js";
import { StockDemoForbiddenError, StockDemoNotCreatedError } from "../domain/ports/in/stock-demo.ports.js";
import type { StockDemoProvisioningPort, StockDemoRepositoryPort, StockDemoSeederPort } from "../domain/ports/out/stock-demo.ports.js";
import type { StockDemoLink, StockDemoScenario } from "../domain/entities/stock-demo.js";

const TODAY = "2026-10-26";
const plans = Object.fromEntries(
  (["brasileira", "hamburgueria", "bar"] as const).map((k) => [k, buildStockDemoPlan(STOCK_DEMO_SCENARIO_DEFS[k], { seed: STOCK_DEMO_SEEDS[k], today: TODAY, locationId: "loc-demo" })]),
) as Record<StockDemoScenario, StockDemoPlan>;
const rows = (p: StockDemoPlan, t: string): Row[] => p.tables.find((x) => x.table === t)?.rows ?? [];

describe("gerador da demonstração do Stock", () => {
  it("determinístico: o mesmo cenário, semente e dia dão o mesmo plano", () => {
    const again = buildStockDemoPlan(STOCK_DEMO_SCENARIO_DEFS.bar, { seed: STOCK_DEMO_SEEDS.bar, today: TODAY, locationId: "loc-demo" });
    expect(JSON.stringify(again)).toBe(JSON.stringify(plans.bar));
    expect(demoUuid(1, "x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("vendas de 30 dias entre 50 000 € e 70 000 € em cada cenário", () => {
    for (const p of Object.values(plans)) {
      expect(p.summary.salesCents30d).toBeGreaterThanOrEqual(5_000_000);
      expect(p.summary.salesCents30d).toBeLessThanOrEqual(7_000_000);
    }
  });

  it("ids únicos e chaves estrangeiras coerentes (linhas → faturas, compras → linhas, movimentos → artigos)", () => {
    for (const p of Object.values(plans)) {
      const ids = p.tables.flatMap((t) => t.rows.map((r) => r.id).filter(Boolean));
      expect(new Set(ids).size).toBe(ids.length);
      const invoices = new Set(rows(p, "invoices").map((r) => r.id));
      const items = new Set(rows(p, "stock_items").map((r) => r.id));
      const lines = new Set(rows(p, "invoice_lines").map((r) => r.id));
      expect(rows(p, "invoice_lines").every((l) => invoices.has(l.invoice_id))).toBe(true);
      expect(rows(p, "stock_review_lines").every((l) => lines.has(l.invoice_line_id) && items.has(l.stock_item_id))).toBe(true);
      expect(rows(p, "stock_movements").every((m) => items.has(m.item_id))).toBe(true);
    }
  });

  it("stock final nunca negativo; só os artigos marcados como «stock baixo» acabam abaixo do mínimo", () => {
    for (const [key, p] of Object.entries(plans) as [StockDemoScenario, StockDemoPlan][]) {
      const qty = new Map<unknown, number>();
      for (const m of rows(p, "stock_movements")) qty.set(m.item_id, (qty.get(m.item_id) ?? 0) + Number(m.quantity));
      const below: string[] = [];
      for (const it of rows(p, "stock_items")) {
        const q = qty.get(it.id) ?? 0;
        expect(q).toBeGreaterThanOrEqual(0);
        if (q < Number(it.min_stock)) below.push(String(it.name));
      }
      const low = STOCK_DEMO_SCENARIO_DEFS[key].ingredients.filter((i) => i.lowStock).map((i) => i.name);
      expect(below.sort()).toEqual(low.sort());
    }
  });

  it("unidades de custo: linha da compra em cêntimos, movimento em euros (por unidade base)", () => {
    const p = plans.hamburgueria;
    const line = rows(p, "stock_review_lines")[0]!;
    const mv = rows(p, "stock_movements").find((m) => m.review_line_id === line.id)!;
    expect(Number(mv.unit_cost_per_base_unit_without_vat)).toBeCloseTo(Number(line.unit_cost_per_base_unit_without_vat) / 100, 6);
    // Linha: total − IVA = líquido; a fatura soma as linhas.
    const inv = rows(p, "invoices").find((i) => i.id === rows(p, "invoice_lines").find((l) => l.id === line.invoice_line_id)!.invoice_id)!;
    const invLines = rows(p, "invoice_lines").filter((l) => l.invoice_id === inv.id);
    expect(invLines.reduce((s, l) => s + Number(l.net_cents), 0)).toBe(inv.subtotal_without_vat);
    expect(invLines.reduce((s, l) => s + Number(l.total_with_vat), 0)).toBe(inv.total_with_vat);
  });

  it("subida de preço visível: o ingrediente «spike» custa mais nas últimas semanas", () => {
    const p = plans.brasileira;
    const picanha = rows(p, "stock_items").find((i) => i.name === "Picanha")!;
    const costs = rows(p, "stock_review_lines").filter((l) => l.stock_item_id === picanha.id).map((l) => Number(l.unit_cost_per_base_unit_without_vat));
    expect(costs.at(-1)! / costs[0]!).toBeGreaterThan(1.15);
  });

  it("bebidas avulsas não são pratos: artigo vendável com PVP, ligado ao POS e com baixa de 1 un. por venda", () => {
    const p = plans.hamburgueria;
    expect(rows(p, "pizzas").map((d) => d.name)).not.toEqual(expect.arrayContaining(["Água", "Refrigerante"]));
    const agua = rows(p, "stock_items").find((i) => i.name === "Água 50cl")!;
    expect(agua).toMatchObject({ is_sellable: true, sale_price: 1.5 });
    expect(rows(p, "vendus_product_mapping").find((m) => m.stock_item_id === agua.id)).toMatchObject({ target_type: "stock", match_value: "DEMO-ART-AGUA" });
    const sold = rows(p, "sales_demand_actuals_daily").filter((d) => d.demand_source_type === "stock" && d.demand_source_ref === agua.id).reduce((s, d) => s + Number(d.quantity_sold), 0);
    const consumed = -rows(p, "stock_movements").filter((m) => m.item_id === agua.id && m.type === "consumption").reduce((s, m) => s + Number(m.quantity), 0);
    expect(sold).toBeGreaterThan(0);
    expect(consumed).toBeCloseTo(sold, 6);
    expect(rows(plans.bar, "pizzas").map((d) => d.name)).not.toContain("Cerveja garrafa");
  });

  it("XS nas doces = metade da Individual; versões das fichas recuam ao início do histórico", () => {
    const p = plans.brasileira;
    const items = rows(p, "pizza_recipe_items");
    const brig = items.filter((i) => i.recipe_id === rows(p, "pizza_recipes").find((r) => r.notes && rows(p, "pizzas").find((d) => d.id === r.pizza_id)!.name === "Brigadeiro")!.id);
    expect(Number(brig.find((i) => i.size === "xs")!.quantity)).toBe(Number(brig.find((i) => i.size === "small")!.quantity) / 2);
    expect(p.historyFrom < `${TODAY}T00:00:00.000Z`).toBe(true);
  });
});

describe("criar e recomeçar a demonstração do Stock", () => {
  const REAL = mintOrganizationId("org-real");
  const DEMO = mintOrganizationId("org-demo");
  class Repo implements StockDemoRepositoryPort {
    links: StockDemoLink[] = [];
    async listForRealOrg() { return this.links; }
    async findByScenario(_o: OrganizationId, s: StockDemoScenario) { return this.links.find((l) => l.scenario === s) ?? null; }
    async findByDemoOrg(o: OrganizationId) { return this.links.find((l) => l.demoOrgId === o) ?? null; }
  }
  const setup = () => {
    const repo = new Repo();
    const calls: string[] = [];
    const provisioning: StockDemoProvisioningPort = {
      realOrgInfo: async () => ({ name: "Empresa Teste", timezone: "Europe/Lisbon" }),
      createOrganization: async (input) => { calls.push(`org:${input.name}`); return DEMO; },
      insertLink: async (l) => { calls.push(`link:${l.scenario}:${l.posName}`); repo.links.push({ ...l, createdAt: "x" }); },
    };
    const seeder: StockDemoSeederPort = {
      ensureLocation: async () => { calls.push("loc"); return "loc-demo"; },
      insertPlan: async (_o, plan) => { calls.push(`plan:${plan.tables.length}`); },
      wipe: async () => { calls.push("wipe"); },
    };
    const forecast = { run: jest.fn(async () => { calls.push("forecast"); }) };
    return { repo, calls, create: new CreateStockDemoUseCase(repo, provisioning, seeder, forecast, () => calls.push("forget"), () => TODAY), reset: new ResetStockDemoUseCase(repo, seeder, forecast, () => TODAY) };
  };

  it("só Admin; cria organização fictícia, liga o cenário ao CaixaFlow POS, semeia e calcula a previsão", async () => {
    const { create, calls } = setup();
    await expect(create.execute({ realOrgId: REAL, isAdmin: false, actor: "x", scenario: "bar" })).rejects.toBeInstanceOf(StockDemoForbiddenError);
    const r = await create.execute({ realOrgId: REAL, isAdmin: true, actor: "admin@exemplo.invalid", scenario: "bar" });
    expect(r.created).toBe(true);
    expect(calls).toEqual(["org:Empresa Teste — Demonstração do Stock: Bar", "link:bar:CaixaFlow POS", "forget", "loc", "plan:19", "forecast"]);
    expect(r.summary!.salesCents30d).toBeGreaterThan(5_000_000);
  });

  it("criar outra vez não duplica", async () => {
    const { create, calls } = setup();
    await create.execute({ realOrgId: REAL, isAdmin: true, actor: "a", scenario: "bar" });
    calls.length = 0;
    expect((await create.execute({ realOrgId: REAL, isAdmin: true, actor: "a", scenario: "bar" })).created).toBe(false);
    expect(calls).toEqual([]);
  });

  it("recomeçar apaga e volta a semear; falhar a previsão não desfaz a demonstração", async () => {
    const { create, reset, calls } = setup();
    await expect(reset.execute({ realOrgId: REAL, isAdmin: true, scenario: "bar" })).rejects.toBeInstanceOf(StockDemoNotCreatedError);
    await create.execute({ realOrgId: REAL, isAdmin: true, actor: "a", scenario: "bar" });
    calls.length = 0;
    const r = await reset.execute({ realOrgId: REAL, isAdmin: true, scenario: "bar" });
    expect(calls).toEqual(["wipe", "loc", "plan:19", "forecast"]);
    expect(r.forecast).toBe("ok");
  });

  it("hoje em Lisboa", () => {
    expect(lisbonToday(new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-26"); // 23:30 UTC = 23:30 em Lisboa (inverno)
    expect(lisbonToday(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02"); // verão: UTC+1
  });
});
