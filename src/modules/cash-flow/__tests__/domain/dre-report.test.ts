import { buildDreReport, type BuildDreInput } from "../../domain/services/dre-report.service.js";
import { resolveDreParameters } from "../../domain/services/dre-parameters.service.js";
import { DEFAULT_DRE_PARAMETERS } from "../../domain/entities/dre-parameters.js";
import { catalog, credit, debit, emptySources } from "../fakes/builders.js";

const noPayments = { card: 0, cash: 0, other: 0 };

function input(overrides: Partial<BuildDreInput> = {}): BuildDreInput {
  return {
    period: { year: 2026, month: 10, from: "2026-10-01", to: "2026-10-31", isCurrentMonth: false },
    debits: [],
    credits: [],
    sources: emptySources(),
    catalog,
    restaurant: { netCents: 0, vatCents: 0, byPaymentGrossCents: noPayments },
    parameters: resolveDreParameters(null, null),
    categoryNetRatios: new Map(),
    manual: { fixedCents: 0, variableCents: 0 },
    ...overrides,
  };
}

describe("buildDreReport", () => {
  it("gastos sem IVA: fatura conciliada tira o IVA; Pessoal é isento; sem categoria conta tudo como «IVA por confirmar»", () => {
    const sources = emptySources();
    sources.invoices.set("makro", { mode: "simple", netRatio: 100 / 123, groupId: null, categoryId: "c-ing", allocations: [], lines: [] });
    const report = buildDreReport(
      input({
        sources,
        debits: [
          debit({ id: "a", amountCents: 12_300, links: [{ entityType: "invoice", entityId: "makro", amountCents: 12_300 }] }),
          debit({ id: "b", amountCents: 95_000, categoryId: "c-sal" }),
          debit({ id: "c", amountCents: 4_000, kind: "card_purchase" }),
        ],
      }),
    );
    expect(report.expenses).toMatchObject({ totalNetCents: 10_000 + 95_000 + 4_000, vatCents: 2_300, estimatedVatCents: 0, pendingVatCents: 4_000, unclassifiedCents: 4_000 });
    const byKey = Object.fromEntries(report.expenses.categories.map((c) => [c.key, c]));
    expect(byKey["g-opd"]).toMatchObject({ netCents: 10_000, vatCents: 2_300, pendingVatCents: 0 });
    expect(byKey["g-pes"]).toMatchObject({ netCents: 95_000, vatCents: 0, pendingVatCents: 0 });
    expect(byKey["kind:card_purchase"]).toMatchObject({ type: "unclassified", netCents: 4_000, pendingVatCents: 4_000 });
  });

  it("IVA estimado: média das últimas faturas da categoria; senão o IVA teórico; a fatura conciliada substitui-o", () => {
    const withAverage = buildDreReport(
      input({ categoryNetRatios: new Map([["c-ing", 100 / 113]]), debits: [debit({ amountCents: 11_300, categoryId: "c-ing" })] }),
    );
    expect(withAverage.expenses).toMatchObject({ totalNetCents: 10_000, vatCents: 1_300, estimatedVatCents: 1_300, pendingVatCents: 0 });

    const theoretical = buildDreReport(input({ debits: [debit({ amountCents: 12_300, categoryId: "c-ing" })] }));
    expect(theoretical.expenses).toMatchObject({ totalNetCents: 10_000, estimatedVatCents: 2_300, pendingVatCents: 0 });

    const sources = emptySources();
    sources.invoices.set("f", { mode: "simple", netRatio: 100 / 106, groupId: null, categoryId: "c-ing", allocations: [], lines: [] });
    const reconciled = buildDreReport(
      input({ sources, debits: [debit({ amountCents: 10_600, links: [{ entityType: "invoice", entityId: "f", amountCents: 10_600 }] })] }),
    );
    expect(reconciled.expenses).toMatchObject({ totalNetCents: 10_000, vatCents: 600, estimatedVatCents: 0, pendingVatCents: 0 });
  });

  it("receita: restaurante pelo Vendus repartido por cartão/dinheiro; plataformas reconstituídas em bruto", () => {
    const report = buildDreReport(
      input({
        restaurant: { netCents: 500_000, vatCents: 65_000, byPaymentGrossCents: { card: 400_000, cash: 150_000, other: 50_000 } },
        credits: [
          credit({ id: "u", amountCents: 63_100, platform: "uber_eats" }),
          credit({ id: "t", amountCents: 300_000, platform: null, kind: "sales", restaurantSale: "card" }),
        ],
      }),
    );
    expect(report.revenue.restaurantByPayment).toEqual({ cardNetCents: 333_333, cashNetCents: 125_000, otherNetCents: 41_667 });
    expect(report.revenue.byPlatform).toEqual([
      {
        platform: "uber_eats",
        receivedCents: 63_100,
        marketingNetCents: 0,
        grossCents: 100_000,
        netCents: 86_957,
        salesVatCents: 13_043,
        commissionNetCents: 30_000,
        commissionVatCents: 6_900,
        marketingVatCents: 0,
        contributionCents: 56_957,
        contributionPct: 65.5,
      },
    ]);
    expect(report.revenue).toMatchObject({ platformsGrossCents: 100_000, platformsNetCents: 86_957, platformsReceivedCents: 63_100, totalNetCents: 586_957 });
    expect(report.platformCosts).toEqual({ commissionNetCents: 30_000, marketingNetCents: 0, totalNetCents: 30_000 });
  });

  it("marketing lançado à mão aumenta o bruto e entra como custo da plataforma", () => {
    const parameters = { ...DEFAULT_DRE_PARAMETERS, marketingNetCents: { uber_eats: 10_000, glovo: 5_000, bolt_food: 0 }, source: "month" as const };
    const report = buildDreReport(input({ parameters, credits: [credit({ amountCents: 63_100, platform: "uber_eats" })] }));
    const uber = report.revenue.byPlatform.find((p) => p.platform === "uber_eats")!;
    // G = (631 + 100 × 1,23) ÷ 0,631
    expect(uber).toMatchObject({ grossCents: Math.round((63_100 + 12_300) / 0.631), marketingNetCents: 10_000, marketingVatCents: 2_300 });
    // Glovo só com marketing também aparece
    expect(report.revenue.byPlatform.map((p) => p.platform).sort()).toEqual(["glovo", "uber_eats"]);
    expect(report.platformCosts.marketingNetCents).toBe(15_000);
  });

  it("resultado, margem, ajustes manuais e saldo do IVA (vendas − compras, com o IVA da comissão)", () => {
    const sources = emptySources();
    sources.invoices.set("f", { mode: "simple", netRatio: 100 / 123, groupId: null, categoryId: "c-ing", allocations: [], lines: [] });
    const report = buildDreReport(
      input({
        sources,
        restaurant: { netCents: 100_000, vatCents: 13_000, byPaymentGrossCents: noPayments },
        debits: [debit({ amountCents: 24_600, links: [{ entityType: "invoice", entityId: "f", amountCents: 24_600 }] })],
        credits: [credit({ amountCents: 63_100, platform: "glovo" })],
        manual: { fixedCents: 10_000, variableCents: 5_000 },
      }),
    );
    expect(report.manualAdjustments).toEqual({ fixedCents: 10_000, variableCents: 5_000, totalCents: 15_000 });
    expect(report.resultCents).toBe(100_000 + 86_957 - 30_000 - 20_000 - 15_000);
    expect(report.marginPct).toBe(65.2);
    expect(report.vat).toEqual({ salesCents: 13_000 + 13_043, purchasesCents: 4_600 + 6_900, purchasesEstimatedCents: 0, balanceCents: 26_043 - 11_500 });
  });

  it("transferências internas e «Fora da DRE» não entram", () => {
    const report = buildDreReport(
      input({
        debits: [debit({ id: "a", reconciliationStatus: "transferencia_interna" }), debit({ id: "b", categoryId: "c-iva" })],
        credits: [credit({ platform: "uber_eats", kind: "internal_transfer" })],
      }),
    );
    expect(report.expenses.totalNetCents).toBe(0);
    expect(report.revenue.platformsReceivedCents).toBe(0);
  });

  it("pedido rápido sem as vendas do restaurante: custos e plataformas completos, resultado e margem a null", () => {
    const report = buildDreReport(
      input({
        restaurantSalesLoaded: false,
        debits: [debit({ amountCents: 95_000, categoryId: "c-sal" })],
        credits: [credit({ amountCents: 63_100, platform: "uber_eats" })],
      }),
    );
    expect(report.restaurantSalesLoaded).toBe(false);
    expect(report.expenses.totalNetCents).toBe(95_000);
    expect(report.revenue.platformsNetCents).toBe(86_957);
    expect(report.resultCents).toBeNull();
    expect(report.marginPct).toBeNull();
  });
});
