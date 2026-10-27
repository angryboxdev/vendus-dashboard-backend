import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetDreUseCase } from "../../application/use-cases/get-dre.use-case.js";
import type { StoredBankCredit, StoredBankDebit } from "../../domain/ports/out/bank-movement-read.port.js";
import { DEFAULT_DRE_PARAMETERS } from "../../domain/entities/dre-parameters.js";
import { InvalidCashFlowPeriodError } from "../../domain/errors.js";
import { catalog, credit, debit, emptySources } from "../fakes/builders.js";

const organizationId = mintOrganizationId("org-a");

function useCase(debits: StoredBankDebit[], credits: StoredBankCredit[]) {
  const calls: Record<string, unknown[]> = { restaurant: [], parameters: [], ratios: [], manual: [] };
  const sources = emptySources();
  sources.invoices.set("makro", { mode: "simple", netRatio: 100 / 123, groupId: null, categoryId: "c-ing", allocations: [], lines: [] });
  const uc = new GetDreUseCase(
    {
      listDebits: async (_o, from, to) => debits.filter((d) => d.date >= from && d.date <= to),
      listCredits: async (_o, from, to) => credits.filter((c) => c.date >= from && c.date <= to),
    },
    { load: async () => sources },
    { load: async () => catalog },
    {
      describe: (d, type) =>
        type === "credit" ? { kind: "sales", platform: d.includes("UBER") ? "uber_eats" : null } : { kind: "transfer_out", platform: null },
    },
    {
      sales: async (_o, from, to) => (
        calls.restaurant!.push([from, to]), { netCents: 200_000, vatCents: 26_000, byPaymentGrossCents: { card: 150_000, cash: 76_000, other: 0 } }
      ),
    },
    {
      forMonth: async (_o, y, m) => (calls.parameters!.push([y, m]), { own: null, previous: { ...DEFAULT_DRE_PARAMETERS, deliverySalesVatPct: 15 } }),
      save: async () => undefined,
    },
    { recentNetRatios: async (_o, until, sample) => (calls.ratios!.push([until, sample]), new Map()) },
    { forMonth: async (_o, y, m) => (calls.manual!.push([y, m]), { fixedCents: 1_000, variableCents: 0 }) },
    () => "2026-10-16",
  );
  return { uc, calls };
}

describe("GetDreUseCase", () => {
  it("mês corrente até hoje: vendas, plataformas em bruto e saídas sem IVA", async () => {
    const { kind: _k, ...d } = debit({ date: "2026-10-05", amountCents: 12_300, links: [{ entityType: "invoice", entityId: "makro", amountCents: 12_300 }] });
    const { kind: _c, platform: _p, ...c } = credit({ date: "2026-10-06", amountCents: 63_100 });
    const { uc, calls } = useCase([{ ...d, description: "TRF P/ MAKRO" }], [{ ...c, description: "STICHTING CUSTODIAN UBER PAYMENTS" }]);

    const report = await uc.execute({ organizationId, year: 2026, month: 10 });

    expect(calls.restaurant).toEqual([["2026-10-01", "2026-10-16"]]);
    expect(calls.parameters).toEqual([[2026, 10]]);
    expect(calls.ratios).toEqual([["2026-10-16", 10]]);
    expect(calls.manual).toEqual([[2026, 10]]);
    expect(report.period).toEqual({ year: 2026, month: 10, from: "2026-10-01", to: "2026-10-16", isCurrentMonth: true });
    expect(report.parameters.source).toBe("inherited");
    expect(report.revenue).toMatchObject({ restaurantNetCents: 200_000, platformsReceivedCents: 63_100, platformsGrossCents: 100_000, platformsNetCents: 86_957 });
    expect(report.expenses).toMatchObject({ totalNetCents: 10_000, vatCents: 2_300 });
    expect(report.resultCents).toBe(200_000 + 86_957 - 30_000 - 10_000 - 1_000);
  });

  it("mês futuro é recusado", async () => {
    const { uc } = useCase([], []);
    await expect(uc.execute({ organizationId, year: 2026, month: 12 })).rejects.toBeInstanceOf(InvalidCashFlowPeriodError);
  });

  it("withRestaurantSales: false não pede as vendas ao Vendus", async () => {
    const { uc, calls } = useCase([], []);
    const report = await uc.execute({ organizationId, year: 2026, month: 10, withRestaurantSales: false });
    expect(calls.restaurant).toEqual([]);
    expect(report).toMatchObject({ restaurantSalesLoaded: false, resultCents: null });
    expect(report.revenue.restaurantNetCents).toBe(0);
  });
});
