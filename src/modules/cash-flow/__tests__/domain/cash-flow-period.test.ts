import { cashFlowPeriod, daysBetween, drePaymentsWindow } from "../../domain/services/cash-flow-period.js";
import { InvalidCashFlowPeriodError } from "../../domain/errors.js";

describe("cashFlowPeriod", () => {
  it("mês corrente: até hoje, comparado com os mesmos dias do mês anterior", () => {
    const p = cashFlowPeriod(2026, 10, "2026-10-16");
    expect(p).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-16",
      monthEnd: "2026-10-31",
      isCurrentMonth: true,
      previous: { from: "2026-09-01", to: "2026-09-16" },
    });
  });

  it("mês fechado: mês inteiro contra o mês anterior inteiro", () => {
    const p = cashFlowPeriod(2026, 3, "2026-10-16");
    expect(p).toMatchObject({ from: "2026-03-01", to: "2026-03-31", isCurrentMonth: false, previous: { from: "2026-02-01", to: "2026-02-28" } });
  });

  it("dia 31 compara com o último dia de um mês mais curto e janeiro com dezembro", () => {
    expect(cashFlowPeriod(2026, 3, "2026-03-31").previous).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(cashFlowPeriod(2026, 1, "2026-01-10").previous).toEqual({ from: "2025-12-01", to: "2025-12-10" });
  });

  it("recusa mês futuro e valores inválidos", () => {
    expect(() => cashFlowPeriod(2026, 11, "2026-10-16")).toThrow(InvalidCashFlowPeriodError);
    expect(() => cashFlowPeriod(2026, 13, "2026-10-16")).toThrow(InvalidCashFlowPeriodError);
    expect(() => cashFlowPeriod(Number.NaN, 1, "2026-10-16")).toThrow(InvalidCashFlowPeriodError);
  });

  it("daysBetween inclui os extremos", () => {
    expect(daysBetween("2026-02-27", "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });
});

describe("drePaymentsWindow", () => {
  it("do mês anterior até 3 meses depois, sem passar de hoje; atravessa o ano", () => {
    expect(drePaymentsWindow(2026, 9, "2026-10-16")).toEqual({ from: "2026-08-01", to: "2026-10-16" });
    expect(drePaymentsWindow(2026, 1, "2027-06-01")).toEqual({ from: "2025-12-01", to: "2026-04-30" });
  });
});
