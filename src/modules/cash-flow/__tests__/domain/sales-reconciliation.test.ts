import { buildSalesReconciliation } from "../../domain/services/sales-reconciliation.service.js";
import type { DailyRestaurantPayments } from "../../domain/entities/sales-reconciliation.js";
import { credit } from "../fakes/builders.js";

const period = { year: 2026, month: 9, from: "2026-09-01", to: "2026-09-30", isCurrentMonth: false };
const sale = (date: string, cardCents: number, cashCents = 0): DailyRestaurantPayments => ({ date, cardCents, cashCents });
const tpa = (date: string, amountCents: number) => credit({ id: `tpa-${date}`, date, amountCents, restaurantSale: "card" });
const dep = (date: string, amountCents: number) => credit({ id: `dep-${date}`, date, amountCents, kind: "deposit", restaurantSale: "cash" });

describe("buildSalesReconciliation", () => {
  it("cada crédito TPA cobre as vendas desde o crédito anterior (fim de semana junto à segunda)", () => {
    const r = buildSalesReconciliation({
      period,
      sales: [sale("2026-09-01", 10_000), sale("2026-09-04", 10_000), sale("2026-09-05", 10_000), sale("2026-09-06", 10_000), sale("2026-09-07", 20_000)],
      credits: [tpa("2026-09-02", 9_900), tpa("2026-09-04", 0), tpa("2026-09-07", 29_700), tpa("2026-09-08", 19_800)],
    });

    expect(r.card.settlements.map((s) => [s.creditDate, s.salesFrom, s.salesTo, s.soldCents, s.receivedCents, s.impliedFeePct, s.status])).toEqual([
      ["2026-09-02", "2026-08-25", "2026-09-01", 10_000, 9_900, 1, "ok"],
      ["2026-09-04", "2026-09-02", "2026-09-03", 0, 0, null, "no_sales"],
      ["2026-09-07", "2026-09-04", "2026-09-06", 30_000, 29_700, 1, "ok"],
      ["2026-09-08", "2026-09-07", "2026-09-07", 20_000, 19_800, 1, "ok"],
    ]);
    expect(r.card).toMatchObject({ soldCents: 60_000, settledSoldCents: 60_000, receivedCents: 59_400, differenceCents: 600, impliedFeePct: 1, expectedFeeCents: 600, pending: null });
  });

  it("taxa fora da tolerância fica «check»; vendas depois do último crédito ficam por liquidar", () => {
    const r = buildSalesReconciliation({
      period,
      sales: [sale("2026-09-10", 10_000), sale("2026-09-29", 4_000), sale("2026-09-30", 1_000)],
      credits: [tpa("2026-09-09", 0), tpa("2026-09-11", 9_500)],
    });
    expect(r.card.settlements.find((s) => s.creditDate === "2026-09-11")).toMatchObject({ impliedFeePct: 5, status: "check" });
    expect(r.card.pending).toEqual({ from: "2026-09-11", to: "2026-09-30", soldCents: 5_000 });
  });

  it("o crédito do dia 1 paga o mês anterior; o do dia 1 do mês seguinte paga o fim do mês", () => {
    const r = buildSalesReconciliation({
      period,
      sales: [sale("2026-08-31", 10_000), sale("2026-09-30", 20_000)],
      credits: [tpa("2026-08-31", 0), tpa("2026-09-01", 9_900), tpa("2026-10-01", 19_800)],
    });
    expect(r.card.settlements.map((s) => s.creditDate)).toEqual(["2026-10-01"]);
    expect(r.card).toMatchObject({ soldCents: 20_000, receivedCents: 19_800, pending: null });
  });

  it("numerário: vendido × depositado, com o vendido desde o depósito anterior", () => {
    const r = buildSalesReconciliation({
      period,
      sales: [sale("2026-09-01", 0, 4_000), sale("2026-09-02", 0, 6_000), sale("2026-09-05", 0, 3_000)],
      credits: [dep("2026-09-03", 10_000)],
    });
    expect(r.cash).toEqual({
      soldCents: 13_000,
      depositedCents: 10_000,
      notDepositedCents: 3_000,
      deposits: [{ date: "2026-09-03", depositedCents: 10_000, soldSincePreviousCents: 10_000 }],
    });
    expect(r.days.find((d) => d.date === "2026-09-03")).toEqual({ date: "2026-09-03", cardSoldCents: 0, cardReceivedCents: 0, cashSoldCents: 0, cashDepositedCents: 10_000 });
    expect(r.days).toHaveLength(30);
  });

  it("numerário: o depósito do início do mês seguinte conta no mês das vendas que cobre", () => {
    const r = buildSalesReconciliation({
      period,
      sales: [sale("2026-08-31", 0, 2_000), sale("2026-09-29", 0, 5_000), sale("2026-09-30", 0, 4_000)],
      credits: [dep("2026-09-01", 2_000), dep("2026-10-02", 9_000)],
    });
    // 1 de setembro leva o numerário de agosto → agosto; 2 de outubro leva o fim de setembro → setembro
    expect(r.cash.deposits.map((d) => d.date)).toEqual(["2026-10-02"]);
    expect(r.cash).toMatchObject({ soldCents: 9_000, depositedCents: 9_000, notDepositedCents: 0 });
  });

  it("ignora transferências internas e créditos que não são vendas do restaurante", () => {
    const r = buildSalesReconciliation({
      period,
      sales: [sale("2026-09-01", 10_000)],
      credits: [
        tpa("2026-09-02", 9_900),
        credit({ id: "uber", date: "2026-09-02", amountCents: 50_000, platform: "uber_eats" }),
        credit({ id: "int", date: "2026-09-02", amountCents: 70_000, restaurantSale: "card", reconciliationStatus: "transferencia_interna" }),
      ],
    });
    expect(r.card.receivedCents).toBe(9_900);
  });
});
