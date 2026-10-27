import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetDreUseCase } from "../../application/use-cases/get-dre.use-case.js";
import type { StoredBankCredit, StoredBankDebit } from "../../domain/ports/out/bank-movement-read.port.js";
import { InvalidCashFlowPeriodError } from "../../domain/errors.js";
import { catalog, credit, debit, emptySources } from "../fakes/builders.js";

const organizationId = mintOrganizationId("org-a");

function useCase(debits: StoredBankDebit[], credits: StoredBankCredit[]) {
  const calls: Record<string, unknown[]> = { restaurant: [], platforms: [], manual: [] };
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
    { sales: async (_o, from, to) => (calls.restaurant!.push([from, to]), { netCents: 200_000, vatCents: 26_000 }) },
    { sales: async (_o, from, to) => (calls.platforms!.push([from, to]), { netCents: 50_000, vatCents: 6_500 }) },
    { forMonth: async (_o, y, m) => (calls.manual!.push([y, m]), { fixedCents: 1_000, variableCents: 0 }) },
    () => "2026-10-16",
  );
  return { uc, calls };
}

describe("GetDreUseCase", () => {
  it("mês corrente até hoje: vendas, liquidações e saídas sem IVA", async () => {
    const { kind: _k, ...d } = debit({ date: "2026-10-05", amountCents: 12_300, links: [{ entityType: "invoice", entityId: "makro", amountCents: 12_300 }] });
    const { kind: _c, platform: _p, ...c } = credit({ date: "2026-10-06", amountCents: 45_200 });
    const { uc, calls } = useCase([{ ...d, description: "TRF P/ MAKRO" }], [{ ...c, description: "STICHTING CUSTODIAN UBER PAYMENTS" }]);

    const report = await uc.execute({ organizationId, year: 2026, month: 10 });

    expect(calls.restaurant).toEqual([["2026-10-01", "2026-10-16"]]);
    expect(calls.platforms).toEqual([["2026-10-01", "2026-10-16"]]);
    expect(calls.manual).toEqual([[2026, 10]]);
    expect(report.period).toEqual({ year: 2026, month: 10, from: "2026-10-01", to: "2026-10-16", isCurrentMonth: true });
    expect(report.revenue).toMatchObject({ restaurantNetCents: 200_000, platformsReceivedCents: 45_200, platformsNetCents: 40_000 });
    expect(report.expenses).toMatchObject({ totalNetCents: 10_000, vatCents: 2_300 });
    expect(report.resultCents).toBe(240_000 - 10_000 - 1_000);
  });

  it("mês futuro é recusado", async () => {
    const { uc } = useCase([], []);
    await expect(uc.execute({ organizationId, year: 2026, month: 12 })).rejects.toBeInstanceOf(InvalidCashFlowPeriodError);
  });
});
