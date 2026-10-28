import { buildDreEntries, buildDreReport, type BuildDreInput } from "../../domain/services/dre-report.service.js";
import { resolveDreParameters } from "../../domain/services/dre-parameters.service.js";
import { DEFAULT_DRE_PARAMETERS } from "../../domain/entities/dre-parameters.js";
import { countedDebits } from "../../domain/services/cash-flow-report.service.js";
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

  it("resultado, margem e saldo do IVA (vendas − compras, com o IVA da comissão)", () => {
    const sources = emptySources();
    sources.invoices.set("f", { mode: "simple", netRatio: 100 / 123, groupId: null, categoryId: "c-ing", allocations: [], lines: [] });
    const report = buildDreReport(
      input({
        sources,
        restaurant: { netCents: 100_000, vatCents: 13_000, byPaymentGrossCents: noPayments },
        debits: [debit({ amountCents: 24_600, links: [{ entityType: "invoice", entityId: "f", amountCents: 24_600 }] })],
        credits: [credit({ amountCents: 63_100, platform: "glovo" })],
      }),
    );
    expect(report.resultCents).toBe(100_000 + 86_957 - 30_000 - 20_000);
    expect(report.marginPct).toBe(73.3);
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

  it("arruma os gastos pelas linhas da DRE (CMV, pessoal, por classificar…) e tira o CAPEX do resultado", () => {
    const capexCatalog = {
      ...catalog,
      groups: [...catalog.groups, { id: "g-cap", code: "CAP", name: "Investimentos", sortOrder: 5 }],
      categories: [...catalog.categories, { id: "c-eq", groupId: "g-cap", code: "CAP.01", name: "Equipamentos", financialType: "capex" }],
    };
    const report = buildDreReport(
      input({
        catalog: capexCatalog,
        restaurant: { netCents: 100_000, vatCents: 0, byPaymentGrossCents: noPayments },
        categoryNetRatios: new Map([["c-ing", 1], ["c-eq", 1]]),
        debits: [
          debit({ id: "a", amountCents: 20_000, categoryId: "c-ing" }),
          debit({ id: "b", amountCents: 30_000, categoryId: "c-sal" }),
          debit({ id: "c", amountCents: 5_000, kind: "card_purchase" }),
          debit({ id: "d", amountCents: 40_000, categoryId: "c-eq" }),
        ],
      }),
    );
    expect(report.expenses.sections.map((s) => [s.key, s.netCents])).toEqual([
      ["cmv", 20_000],
      ["personnel", 30_000],
      ["unclassified", 5_000],
      ["capex", 40_000],
    ]);
    expect(report.expenses.sections.find((s) => s.key === "unclassified")!.items[0]).toMatchObject({ movementKind: "card_purchase", name: null });
    expect(report.expenses.capexNetCents).toBe(40_000);
    expect(report.resultCents).toBe(100_000 - 20_000 - 30_000 - 5_000);
  });

  it("sem fatura nem categoria: vencimentos → pessoal, energia → estrutura, seguros → administrativo, taxas → financeiro; o resto fica pelo extrato", () => {
    const report = buildDreReport(
      input({
        debits: [
          debit({ id: "a", amountCents: 1_000, kind: "payroll" }),
          debit({ id: "b", amountCents: 2_000, kind: "utilities" }),
          debit({ id: "c", amountCents: 3_000, kind: "insurance" }),
          debit({ id: "d", amountCents: 4_000, kind: "bank_fee" }),
          debit({ id: "e", amountCents: 5_000, kind: "transfer_out" }),
        ],
      }),
    );
    expect(report.expenses.sections.map((s) => [s.key, s.netCents, s.items.map((i) => i.movementKind)])).toEqual([
      ["personnel", 1_000, ["payroll"]],
      ["structure", 2_000, ["utilities"]],
      ["administrative", 3_000, ["insurance"]],
      ["unclassified", 5_000, ["transfer_out"]],
      ["financial", 4_000, ["bank_fee"]],
    ]);
  });

  it("comissão do TPA: taxa do mês sobre o vendido em cartão, abatida no resultado (sem IVA dedutível)", () => {
    const report = buildDreReport(
      input({
        restaurant: { netCents: 100_000, vatCents: 13_000, byPaymentGrossCents: { card: 90_000, cash: 23_000, other: 0 } },
        parameters: { ...resolveDreParameters(null, null), cardFeePct: 1.2 },
      }),
    );
    expect(report.cardFees).toEqual({ cardGrossCents: 90_000, ratePct: 1.2, netCents: 1_080 });
    expect(report.resultCents).toBe(100_000 - 1_080);
    expect(report.vat.purchasesCents).toBe(0);
  });

  it("empréstimos: só os juros (categoria financeira fora do «Fora da DRE») entram; o capital fica de fora", () => {
    const loanCatalog = {
      ...catalog,
      groups: [...catalog.groups, { id: "g-adm", code: "ADM", name: "Administrativo", sortOrder: 4 }],
      categories: [
        ...catalog.categories,
        { id: "c-jur", groupId: "g-adm", code: "ADM.03", name: "Taxas e juros", financialType: "financial" },
        { id: "c-emp", groupId: "g-fdr", code: "FDR.04", name: "Empréstimos", financialType: "financial" },
      ],
    };
    const loan = { justificationType: "emprestimo_financiamento", reconciliationStatus: "justificado" } as const;
    const report = buildDreReport(
      input({
        catalog: loanCatalog,
        debits: [
          debit({ id: "capital", amountCents: 80_000, categoryId: "c-emp", ...loan }),
          debit({ id: "juros", amountCents: 3_000, categoryId: "c-jur", ...loan }),
          debit({ id: "sem-categoria", amountCents: 50_000, ...loan }),
        ],
      }),
    );
    expect(report.expenses.totalNetCents).toBe(3_000);
    expect(report.expenses.sections.map((s) => [s.key, s.netCents])).toEqual([["financial", 3_000]]);
  });

  it("o fluxo de caixa continua a deixar os empréstimos de fora (os juros só entram na DRE)", () => {
    const loan = { justificationType: "emprestimo_financiamento", reconciliationStatus: "justificado" } as const;
    const debits = [debit({ id: "juros", amountCents: 3_000, categoryId: "c-sal", ...loan })];
    expect(countedDebits(debits, emptySources(), catalog)).toEqual([]);
  });

  it("competência: conta no mês da fatura (ou no mês da recorrência), não no do pagamento", () => {
    const sources = emptySources();
    sources.invoices.set("out", { mode: "simple", netRatio: 1, groupId: null, categoryId: "c-ing", allocations: [], lines: [], date: "2026-10-30" });
    sources.invoices.set("set", { mode: "simple", netRatio: 1, groupId: null, categoryId: "c-ing", allocations: [], lines: [], date: "2026-09-30" });
    sources.occurrences.set("sal-out", { invoiceId: null, groupId: "g-pes", categoryId: "c-sal", period: "2026-10", label: "Salários" });
    const report = buildDreReport(
      input({
        sources,
        debits: [
          // fatura de outubro paga em novembro → outubro
          debit({ id: "a", date: "2026-11-10", amountCents: 1_000, links: [{ entityType: "invoice", entityId: "out", amountCents: 1_000 }] }),
          // fatura de setembro paga em outubro → setembro (fora)
          debit({ id: "b", date: "2026-10-05", amountCents: 2_000, links: [{ entityType: "invoice", entityId: "set", amountCents: 2_000 }] }),
          // salários de outubro pagos a 3 de novembro → outubro
          debit({ id: "c", date: "2026-11-03", amountCents: 30_000, matchedEntityType: "recurrence_occurrence", matchedEntityId: "sal-out" }),
          // sem documento: pela data do pagamento
          debit({ id: "d", date: "2026-10-20", amountCents: 400, categoryId: "c-sal" }),
          debit({ id: "e", date: "2026-11-02", amountCents: 999, categoryId: "c-sal" }),
        ],
      }),
    );
    expect(report.expenses.totalNetCents).toBe(1_000 + 30_000 + 400);
  });

  it("fora da operação: retiradas de sócios e capital de empréstimos num bloco à parte, fora do resultado; o IVA não aparece", () => {
    const offCatalog = {
      ...catalog,
      // Como no catálogo predefinido: IVA (FDR.03) é «fiscal».
      categories: [
        ...catalog.categories.map((c) => (c.id === "c-iva" ? { ...c, financialType: "fiscal" } : c)),
        { id: "c-ret", groupId: "g-fdr", code: "FDR.01", name: "Retirada de sócios", financialType: "off_dre" },
      ],
    };
    const report = buildDreReport(
      input({
        catalog: offCatalog,
        restaurant: { netCents: 100_000, vatCents: 0, byPaymentGrossCents: noPayments },
        debits: [
          debit({ id: "a", amountCents: 20_000, categoryId: "c-ret" }),
          debit({ id: "b", amountCents: 50_000, justificationType: "emprestimo_financiamento", reconciliationStatus: "justificado" }),
          debit({ id: "c", amountCents: 7_000, categoryId: "c-iva" }),
          debit({ id: "d", amountCents: 9_000, justificationType: "transferencia_interna", reconciliationStatus: "transferencia_interna" }),
        ],
      }),
    );
    expect(report.expenses.totalNetCents).toBe(0);
    expect(report.resultCents).toBe(100_000);
    expect(report.expenses.offOperation).toEqual({
      totalCents: 70_000,
      items: [
        { key: "loan", categoryId: null, code: null, name: "Empréstimos (capital)", movementKind: null, netCents: 50_000 },
        { key: "c-ret", categoryId: "c-ret", code: "FDR.01", name: "Retirada de sócios", movementKind: null, netCents: 20_000 },
      ],
    });
  });

  it("pagamentos: uma entrada por parte, com a rubrica onde entra e a base do IVA, por data", () => {
    const entries = buildDreEntries(
      input({
        debits: [
          debit({ id: "a", date: "2026-10-03", amountCents: 12_300, categoryId: "c-ing", label: "Compra com cartão — Mercado" }),
          debit({ id: "b", date: "2026-10-01", amountCents: 4_000, kind: "card_purchase" }),
        ],
      }),
    );
    expect(entries.map((e) => [e.movementId, e.section, e.itemKey, e.basis, e.vatBasis, e.netCents])).toEqual([
      ["b", "unclassified", "kind:card_purchase", "extract", "pending", 4_000],
      ["a", "cmv", "c-ing", "movement", "estimated", 10_000],
    ]);
    expect(entries[1]!.description).toBe("Compra com cartão — Mercado");
  });
});
