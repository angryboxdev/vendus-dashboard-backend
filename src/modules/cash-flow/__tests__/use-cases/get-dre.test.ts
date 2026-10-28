import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetDreEntriesUseCase, GetDreUseCase } from "../../application/use-cases/get-dre.use-case.js";
import type { StoredBankCredit, StoredBankDebit } from "../../domain/ports/out/bank-movement-read.port.js";
import { DEFAULT_DRE_PARAMETERS } from "../../domain/entities/dre-parameters.js";
import { InvalidCashFlowPeriodError } from "../../domain/errors.js";
import type { UnpaidInvoice } from "../../domain/entities/cash-flow.js";
import { catalog, credit, debit, emptySources } from "../fakes/builders.js";

const organizationId = mintOrganizationId("org-a");

function useCase(debits: StoredBankDebit[], credits: StoredBankCredit[], unpaid: UnpaidInvoice[] = []) {
  const calls: Record<string, unknown[]> = { restaurant: [], parameters: [], ratios: [] };
  const sources = emptySources();
  sources.invoices.set("makro", { mode: "simple", netRatio: 100 / 123, groupId: null, categoryId: "c-ing", allocations: [], lines: [] });
  sources.invoices.set("makro-set", { mode: "simple", netRatio: 100 / 123, groupId: null, categoryId: "c-ing", allocations: [], lines: [], date: "2026-09-28", label: "Fornecedor Teste · FT 9" });
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
    { unpaidInvoices: async (_o, from, to) => ((calls.unpaid = [from, to]), unpaid) },
    () => "2026-10-16",
  );
  const entries = new GetDreEntriesUseCase(
    {
      listDebits: async (_o, from, to) => ((calls.debitWindow = [from, to]), debits.filter((d) => d.date >= from && d.date <= to)),
      listCredits: async () => [],
    },
    { load: async () => sources },
    { load: async () => catalog },
    { describe: (d) => ({ kind: "transfer_out", platform: null, label: `Legível: ${d}` }) },
    { forMonth: async () => ({ own: null, previous: null }), save: async () => undefined },
    { recentNetRatios: async () => new Map() },
    { unpaidInvoices: async () => unpaid },
    () => "2026-10-16",
  );
  return { uc, calls, entries };
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
    expect(report.period).toEqual({ year: 2026, month: 10, from: "2026-10-01", to: "2026-10-16", isCurrentMonth: true });
    expect(report.parameters.source).toBe("inherited");
    expect(report.revenue).toMatchObject({ restaurantNetCents: 200_000, platformsReceivedCents: 63_100, platformsGrossCents: 100_000, platformsNetCents: 86_957 });
    expect(report.expenses).toMatchObject({ totalNetCents: 10_000, vatCents: 2_300 });
    // Comissão do TPA: 1% de 150 000 vendidos em cartão
    expect(report.cardFees).toEqual({ cardGrossCents: 150_000, ratePct: 1, netCents: 1_500 });
    expect(report.resultCents).toBe(200_000 + 86_957 - 30_000 - 1_500 - 10_000);
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

  it("mês fechado pela data da fatura: o pagamento de outubro de uma fatura de setembro conta em setembro", async () => {
    const { kind: _k, ...paid } = debit({ id: "m-out", date: "2026-10-05", amountCents: 12_300, links: [{ entityType: "invoice", entityId: "makro-set", amountCents: 12_300 }] });
    const { kind: _k2, ...plain } = debit({ id: "m-set", date: "2026-09-10", amountCents: 5_000 });
    const { uc } = useCase([{ ...paid, description: "TRF P/ FORNECEDOR" }, { ...plain, description: "TRF P/ OUTRO" }], []);

    const september = await uc.execute({ organizationId, year: 2026, month: 9, withRestaurantSales: false });
    expect(september.expenses.totalNetCents).toBe(10_000 + 5_000);

    const october = await uc.execute({ organizationId, year: 2026, month: 10, withRestaurantSales: false });
    expect(october.expenses.totalNetCents).toBe(0);
  });

  it("pagamentos da DRE: rubrica, descrição do extrato, documento e as duas datas", async () => {
    const { kind: _k, ...paid } = debit({ id: "m-out", date: "2026-10-05", amountCents: 12_300, links: [{ entityType: "invoice", entityId: "makro-set", amountCents: 12_300 }] });
    const { entries, calls } = useCase([{ ...paid, description: "TRF P/ FORNECEDOR" }], []);

    const r = await entries.execute({ organizationId, year: 2026, month: 9 });
    // Pagamentos lidos de agosto até hoje (mês + 3 meses, sem passar de hoje)
    expect(calls.debitWindow).toEqual(["2026-08-01", "2026-10-16"]);
    expect(r.entries).toEqual([
      {
        section: "cmv",
        itemKey: "c-ing",
        movementId: "m-out",
        paidOn: "2026-10-05",
        competenceDate: "2026-09-28",
        description: "Legível: TRF P/ FORNECEDOR",
        document: "Fornecedor Teste · FT 9",
        basis: "document",
        grossCents: 12_300,
        netCents: 10_000,
        vatBasis: "real",
      },
    ]);
  });

  it("faturas do mês por pagar: pedidas para o mês inteiro e somadas aos gastos; na lista, sem data de pagamento", async () => {
    const unpaid: UnpaidInvoice[] = [
      { id: "renda", totalCents: 12_300, data: { mode: "simple", netRatio: 100 / 123, groupId: null, categoryId: "c-ing", allocations: [], lines: [], date: "2026-10-01", label: "Senhorio Teste · FT 3" } },
    ];
    const { uc, entries, calls } = useCase([], [], unpaid);

    const report = await uc.execute({ organizationId, year: 2026, month: 10, withRestaurantSales: false });
    expect(calls.unpaid).toEqual(["2026-10-01", "2026-10-31"]);
    expect(report.expenses.totalNetCents).toBe(10_000);
    expect(report.expenses.unpaidInvoices).toEqual({ count: 1, netCents: 10_000 });
    expect(report.vat.purchasesCents).toBe(2_300);

    const list = await entries.execute({ organizationId, year: 2026, month: 10 });
    expect(list.entries).toMatchObject([{ section: "cmv", paidOn: null, competenceDate: "2026-10-01", document: "Senhorio Teste · FT 3", netCents: 10_000, vatBasis: "real" }]);
  });
});
