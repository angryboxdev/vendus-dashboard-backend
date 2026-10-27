import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetDreRestaurantSalesUseCase } from "../../application/use-cases/get-dre-restaurant-sales.use-case.js";
import { InvalidCashFlowPeriodError } from "../../domain/errors.js";

const organizationId = mintOrganizationId("org-a");

describe("GetDreRestaurantSalesUseCase", () => {
  it("vendas do restaurante do mês (até hoje) repartidas por cartão/dinheiro/outros", async () => {
    const calls: unknown[] = [];
    const uc = new GetDreRestaurantSalesUseCase(
      { sales: async (_o, from, to) => (calls.push([from, to]), { netCents: 100_000, vatCents: 13_000, byPaymentGrossCents: { card: 80_000, cash: 20_000, other: 0 } }) },
      () => "2026-10-16",
    );
    const r = await uc.execute({ organizationId, year: 2026, month: 10 });
    expect(calls).toEqual([["2026-10-01", "2026-10-16"]]);
    expect(r).toEqual({
      period: { year: 2026, month: 10, from: "2026-10-01", to: "2026-10-16", isCurrentMonth: true },
      netCents: 100_000,
      vatCents: 13_000,
      byPayment: { cardNetCents: 80_000, cashNetCents: 20_000, otherNetCents: 0 },
    });
  });

  it("mês futuro é recusado", async () => {
    const uc = new GetDreRestaurantSalesUseCase({ sales: async () => ({ netCents: 0, vatCents: 0, byPaymentGrossCents: { card: 0, cash: 0, other: 0 } }) }, () => "2026-10-16");
    await expect(uc.execute({ organizationId, year: 2026, month: 12 })).rejects.toBeInstanceOf(InvalidCashFlowPeriodError);
  });
});
