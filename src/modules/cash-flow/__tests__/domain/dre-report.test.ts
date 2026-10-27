import { buildDreReport, type BuildDreInput } from "../../domain/services/dre-report.service.js";
import { catalog, credit, debit, emptySources } from "../fakes/builders.js";

function input(overrides: Partial<BuildDreInput> = {}): BuildDreInput {
  return {
    period: { year: 2026, month: 10, from: "2026-10-01", to: "2026-10-31", isCurrentMonth: false },
    debits: [],
    credits: [],
    sources: emptySources(),
    catalog,
    restaurant: { netCents: 0, vatCents: 0 },
    platformsSold: { netCents: 0, vatCents: 0 },
    manual: { fixedCents: 0, variableCents: 0 },
    ...overrides,
  };
}

describe("buildDreReport", () => {
  it("gastos sem IVA: fatura conciliada tira o IVA; Pessoal é isento; sem informação conta tudo como «IVA por confirmar»", () => {
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
    expect(report.expenses).toMatchObject({ totalNetCents: 10_000 + 95_000 + 4_000, vatCents: 2_300, pendingVatCents: 4_000, unclassifiedCents: 4_000 });
    const byKey = Object.fromEntries(report.expenses.categories.map((c) => [c.key, c]));
    expect(byKey["g-opd"]).toMatchObject({ netCents: 10_000, vatCents: 2_300, pendingVatCents: 0 });
    expect(byKey["g-pes"]).toMatchObject({ netCents: 95_000, vatCents: 0, pendingVatCents: 0 });
    expect(byKey["kind:card_purchase"]).toMatchObject({ type: "unclassified", netCents: 4_000, pendingVatCents: 4_000 });
  });

  it("conciliar com a fatura altera o valor: a mesma saída passa de «IVA por confirmar» a sem IVA", () => {
    const before = buildDreReport(input({ debits: [debit({ amountCents: 12_300, categoryId: "c-ing" })] }));
    expect(before.expenses).toMatchObject({ totalNetCents: 12_300, pendingVatCents: 12_300 });

    const sources = emptySources();
    sources.invoices.set("f", { mode: "simple", netRatio: 100 / 123, groupId: null, categoryId: "c-ing", allocations: [], lines: [] });
    const after = buildDreReport(
      input({ sources, debits: [debit({ amountCents: 12_300, links: [{ entityType: "invoice", entityId: "f", amountCents: 12_300 }] })] }),
    );
    expect(after.expenses).toMatchObject({ totalNetCents: 10_000, vatCents: 2_300, pendingVatCents: 0 });
  });

  it("receita: restaurante pelo Vendus; plataformas pelas liquidações no banco sem IVA (taxa do AirMenu) e comissão estimada", () => {
    const report = buildDreReport(
      input({
        restaurant: { netCents: 500_000, vatCents: 65_000 },
        platformsSold: { netCents: 100_000, vatCents: 13_000 },
        credits: [
          credit({ id: "u", amountCents: 79_100, platform: "uber_eats" }),
          credit({ id: "t", amountCents: 300_000, platform: null, kind: "sales" }),
        ],
      }),
    );
    expect(report.revenue).toMatchObject({
      restaurantNetCents: 500_000,
      platformsReceivedCents: 79_100,
      platformsNetCents: 70_000,
      platformsSoldNetCents: 100_000,
      platformsCommissionEstimateCents: 30_000,
      platformsVatKnown: true,
      totalNetCents: 570_000,
    });
    expect(report.revenue.byPlatform).toEqual([{ platform: "uber_eats", receivedCents: 79_100, netCents: 70_000 }]);
  });

  it("resultado, margem, ajustes manuais e saldo do IVA (vendas − compras)", () => {
    const sources = emptySources();
    sources.invoices.set("f", { mode: "simple", netRatio: 100 / 123, groupId: null, categoryId: "c-ing", allocations: [], lines: [] });
    const report = buildDreReport(
      input({
        sources,
        restaurant: { netCents: 100_000, vatCents: 13_000 },
        debits: [debit({ amountCents: 24_600, links: [{ entityType: "invoice", entityId: "f", amountCents: 24_600 }] })],
        manual: { fixedCents: 10_000, variableCents: 5_000 },
      }),
    );
    expect(report.manualAdjustments).toEqual({ fixedCents: 10_000, variableCents: 5_000, totalCents: 15_000 });
    expect(report.resultCents).toBe(100_000 - 20_000 - 15_000);
    expect(report.marginPct).toBe(65);
    expect(report.vat).toEqual({ salesCents: 13_000, purchasesCents: 4_600, balanceCents: 8_400 });
  });

  it("sem vendas no AirMenu: as liquidações contam pelo valor total e fica assinalado", () => {
    const report = buildDreReport(input({ credits: [credit({ amountCents: 5_000, platform: "glovo" })] }));
    expect(report.revenue).toMatchObject({ platformsNetCents: 5_000, platformsVatKnown: false });
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
});
