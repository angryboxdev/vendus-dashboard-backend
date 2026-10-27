import { buildCashFlowReport } from "../../domain/services/cash-flow-report.service.js";
import { cashFlowPeriod } from "../../domain/services/cash-flow-period.js";
import { catalog, credit, debit, emptySources } from "../fakes/builders.js";

const period = cashFlowPeriod(2026, 10, "2026-10-03");

describe("buildCashFlowReport", () => {
  it("séries diárias, totais, margem e comparação com os mesmos dias do mês anterior", () => {
    const report = buildCashFlowReport({
      period,
      current: {
        credits: [credit({ id: "x", date: "2026-10-01", amountCents: 50_000 }), credit({ id: "y", date: "2026-10-03", amountCents: 50_000 })],
        debits: [debit({ id: "a", date: "2026-10-02", amountCents: 20_000, categoryId: "c-ing" })],
      },
      previous: {
        credits: [credit({ id: "z", date: "2026-09-02", amountCents: 40_000, kind: "transfer_in" })],
        debits: [debit({ id: "b", date: "2026-09-01", amountCents: 10_000, categoryId: "c-ing" })],
      },
      sources: emptySources(),
      catalog,
    });

    expect(report.days).toEqual([
      { date: "2026-10-01", inflowCents: 50_000, outflowCents: 0 },
      { date: "2026-10-02", inflowCents: 0, outflowCents: 20_000 },
      { date: "2026-10-03", inflowCents: 50_000, outflowCents: 0 },
    ]);
    expect(report.previousDays).toHaveLength(3);
    expect(report.totals).toEqual({ inflowCents: 100_000, outflowCents: 20_000, netCents: 80_000, marginPct: 80 });
    expect(report.previousTotals).toMatchObject({ inflowCents: 40_000, outflowCents: 10_000, marginPct: 75 });
    expect(report.inflowKinds).toEqual([{ movementKind: "sales", amountCents: 100_000, previousAmountCents: 0 }]);
    expect(report.categories).toEqual([
      {
        key: "g-opd",
        type: "group",
        groupId: "g-opd",
        code: "OPD",
        name: "Operação Direta",
        movementKind: null,
        amountCents: 20_000,
        previousAmountCents: 10_000,
        children: [{ key: "c-ing", categoryId: "c-ing", code: "OPD.01", name: "Ingredientes", amountCents: 20_000, previousAmountCents: 10_000 }],
      },
    ]);
  });

  it("saídas sem categoria agrupam-se pelo tipo genérico do banco", () => {
    const report = buildCashFlowReport({
      period,
      current: {
        credits: [],
        debits: [
          debit({ id: "a", amountCents: 3_000, date: "2026-10-01", kind: "transfer_out" }),
          debit({ id: "b", amountCents: 1_000, date: "2026-10-01", kind: "card_purchase" }),
          debit({ id: "c", amountCents: 2_000, date: "2026-10-02", kind: "transfer_out" }),
        ],
      },
      previous: { credits: [], debits: [] },
      sources: emptySources(),
      catalog,
    });
    expect(report.categories.map((c) => [c.key, c.type, c.movementKind, c.amountCents])).toEqual([
      ["kind:transfer_out", "unclassified", "transfer_out", 5_000],
      ["kind:card_purchase", "unclassified", "card_purchase", 1_000],
    ]);
    expect(report.totals.marginPct).toBeNull();
  });

  it("exclui transferências internas e empréstimos (entradas e saídas) e o grupo «Fora da DRE»", () => {
    const report = buildCashFlowReport({
      period,
      current: {
        credits: [
          credit({ id: "p", amountCents: 9_000, date: "2026-10-01", kind: "internal_transfer" }),
          credit({ id: "q", amountCents: 9_000, date: "2026-10-01", justificationType: "emprestimo_financiamento" }),
          credit({ id: "r", amountCents: 500, date: "2026-10-01" }),
        ],
        debits: [
          debit({ id: "a", amountCents: 1_000, date: "2026-10-01", reconciliationStatus: "transferencia_interna" }),
          debit({ id: "b", amountCents: 1_000, date: "2026-10-01", justificationType: "emprestimo_financiamento" }),
          debit({ id: "c", amountCents: 1_000, date: "2026-10-01", kind: "internal_transfer" }),
          debit({ id: "d", amountCents: 1_000, date: "2026-10-01", categoryId: "c-iva" }),
          debit({ id: "e", amountCents: 700, date: "2026-10-01", categoryId: "c-sal" }),
        ],
      },
      previous: { credits: [], debits: [] },
      sources: emptySources(),
      catalog,
    });
    expect(report.totals.inflowCents).toBe(500);
    expect(report.totals.outflowCents).toBe(700);
    expect(report.justification.totalCents).toBe(700);
  });

  it("% justificada por valor: resolvidas contam inteiras, parciais pelo valor ligado", () => {
    const report = buildCashFlowReport({
      period,
      current: {
        credits: [],
        debits: [
          debit({ id: "a", amountCents: 6_000, date: "2026-10-01", reconciliationStatus: "conciliado_com_fatura" }),
          debit({
            id: "b",
            amountCents: 2_000,
            date: "2026-10-01",
            reconciliationStatus: "conciliado_parcial",
            links: [{ entityType: "invoice", entityId: "x", amountCents: 1_000 }],
          }),
          debit({ id: "c", amountCents: 2_000, date: "2026-10-01" }),
        ],
      },
      previous: { credits: [], debits: [] },
      sources: emptySources(),
      catalog,
    });
    expect(report.justification).toEqual({ totalCents: 10_000, justifiedCents: 7_000, percent: 70, pendingCount: 2 });
  });

  it("sem movimentos: percentagem null e listas vazias", () => {
    const empty = { credits: [], debits: [] };
    const report = buildCashFlowReport({ period, current: empty, previous: empty, sources: emptySources(), catalog });
    expect(report.justification.percent).toBeNull();
    expect(report.categories).toEqual([]);
    expect(report.inflowKinds).toEqual([]);
  });
});
