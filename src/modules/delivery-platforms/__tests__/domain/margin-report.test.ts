import type { PlatformStatement, StatementLine } from "../../domain/entities/platform-statement.js";
import type { StoredPlatformStatement } from "../../domain/ports/out/platform-statement-repository.port.js";
import { DEFAULT_SALES_VAT_RATE, buildMarginReport } from "../../domain/services/margin-report.service.js";
import { allocateToMonth, daysBetween } from "../../domain/services/month-allocation.js";

const doc = (over: Partial<PlatformStatement> & Pick<PlatformStatement, "platform" | "documentKind" | "documentNumber" | "periodFrom" | "periodTo">): StoredPlatformStatement => ({
  issuedOn: null,
  ordersCount: null,
  lines: [],
  payouts: [],
  netPayoutCents: 0,
  id: over.documentNumber,
  fileName: "f",
  importedBy: null,
  importedAt: "2026-10-28T10:00:00Z",
  ...over,
});

/** SAF-T fictício: o mesmo faturado em todos os dias do período. */
const saft = (from: string, to: string, perDayCents: number, vatPerDayCents = 0) =>
  doc({
    platform: "airmenu",
    documentKind: "airmenu_saft",
    documentNumber: `SAFT-${from}-${to}`,
    periodFrom: from,
    periodTo: to,
    lines: daysBetween(from, to).map((date): StatementLine => ({ kind: "sales", label: date, grossCents: perDayCents, vatCents: vatPerDayCents, date })),
  });

const glovo = doc({
  platform: "glovo",
  documentKind: "glovo_statement",
  documentNumber: "GLOVOTEST",
  periodFrom: "2026-08-25",
  periodTo: "2026-09-07",
  ordersCount: 40,
  lines: [
    { kind: "sales", label: "Produtos", grossCents: 20000, vatCents: 0 },
    { kind: "commission", label: "Taxa de acesso", grossCents: 4000, vatCents: 748 },
  ],
  netPayoutCents: 16000,
});

describe("allocateToMonth", () => {
  it("quinzena que atravessa o mês: reparte pelo faturado diário do SAF-T dos dois meses", () => {
    const context = [glovo, saft("2026-08-01", "2026-08-31", 100), saft("2026-09-01", "2026-09-30", 300)];
    const [a] = allocateToMonth([glovo], context, "2026-09-01", "2026-09-30");
    // 7 dias de agosto × 100 contra 7 dias de setembro × 300 → 75% em setembro.
    expect(a!.meta).toMatchObject({ share: 0.75, basis: "saft" });
    expect(a!.lines.map((l) => l.grossCents)).toEqual([15000, 3000]);
    expect(a!.lines[1]!.vatCents).toBe(561);
    expect(a!.ordersCount).toBe(30);
    expect(a!.netPayoutCents).toBe(12000);
  });

  it("sem SAF-T de algum dia: proporção de dias (estimativa)", () => {
    const [a] = allocateToMonth([glovo], [glovo, saft("2026-09-01", "2026-09-30", 300)], "2026-09-01", "2026-09-30");
    expect(a!.meta).toMatchObject({ share: 0.5, basis: "days" });
  });

  it("documento com dias (pedidos da Bolt): só os dias do mês", () => {
    const orders = doc({
      platform: "bolt_food",
      documentKind: "bolt_orders_report",
      documentNumber: "PEDIDOS",
      periodFrom: "2026-08-31",
      periodTo: "2026-09-03",
      ordersCount: 4,
      lines: [
        { kind: "sales", label: "a", grossCents: 1000, vatCents: 0, date: "2026-08-31" },
        { kind: "sales", label: "b", grossCents: 3000, vatCents: 0, date: "2026-09-03" },
        { kind: "cash", label: "c", grossCents: 500, vatCents: 0, date: "2026-09-03" },
      ],
      netPayoutCents: 3500,
    });
    const [a] = allocateToMonth([orders], [orders], "2026-09-01", "2026-09-30");
    expect(a!.meta).toMatchObject({ share: 0.75, basis: "daily" });
    expect(a!.lines.map((l) => l.label)).toEqual(["b", "c"]);
    expect(a!.netPayoutCents).toBe(2500);
    expect(a!.ordersCount).toBe(3);
  });

  it("fatura semanal da Bolt: pelas vendas diárias do relatório de pedidos", () => {
    const orders = doc({
      platform: "bolt_food",
      documentKind: "bolt_orders_report",
      documentNumber: "PEDIDOS",
      periodFrom: "2026-08-31",
      periodTo: "2026-09-06",
      lines: [
        { kind: "sales", label: "a", grossCents: 1000, vatCents: 0, date: "2026-08-31" },
        { kind: "sales", label: "b", grossCents: 3000, vatCents: 0, date: "2026-09-03" },
      ],
    });
    const invoice = doc({
      platform: "bolt_food",
      documentKind: "bolt_weekly_invoice",
      documentNumber: "PT9999-1",
      periodFrom: "2026-08-31",
      periodTo: "2026-09-06",
      lines: [{ kind: "commission", label: "Comissão semanal", grossCents: 1320, vatCents: 0 }],
      netPayoutCents: -1320,
    });
    const [a] = allocateToMonth([invoice], [orders, invoice], "2026-09-01", "2026-09-30");
    expect(a!.meta).toMatchObject({ share: 0.75, basis: "orders" });
    expect(a!.netPayoutCents).toBe(-990);
  });
});

describe("buildMarginReport", () => {
  const uber = doc({
    platform: "uber_eats",
    documentKind: "uber_monthly_statement",
    documentNumber: "UBERTEST",
    periodFrom: "2026-09-01",
    periodTo: "2026-09-30",
    ordersCount: 10,
    lines: [
      { kind: "sales", label: "Vendas", grossCents: 11300, vatCents: 0 },
      { kind: "promotion", label: "Ofertas", grossCents: 1130, vatCents: 0 },
      { kind: "commission", label: "Taxas de mercado", grossCents: 1230, vatCents: 230 },
      { kind: "marketing", label: "Anúncios", grossCents: 615, vatCents: 115 },
      { kind: "refund", label: "Estornos", grossCents: 100, vatCents: 0 },
    ],
    netPayoutCents: 8225,
  });

  it("tira o IVA pela taxa do SAF-T e calcula margem bruta, comida, margem líquida e IVA a entregar", () => {
    // SAF-T de setembro: 30 dias × 1,13 € com 0,13 € de IVA → taxa 13,0%.
    const s = saft("2026-09-01", "2026-09-30", 113, 13);
    const r = buildMarginReport(2026, 9, [uber, s], [uber, s]);
    expect(r.salesVatRateSource).toBe("saft");
    expect(r.salesVatRate).toBeCloseTo(0.13, 6);
    expect(r.platforms.map((p) => p.platform)).toEqual(["uber_eats"]);
    expect(r.total).toMatchObject({
      ordersCount: 10,
      salesGrossCents: 11300,
      paidByCustomersCents: 10170,
      salesNetCents: 10000,
      promotionsNetCents: 1000,
      invoicedNetCents: 9000,
      commissionNetCents: 1000,
      marketingNetCents: 500,
      otherNetCents: 100,
      grossMarginCents: 7400,
      grossMarginPct: 74,
      foodCostCents: 2700,
      netMarginCents: 4700,
      netMarginPct: 47,
      netMarginPerOrderCents: 470,
      salesVatCents: 1170,
      feesVatCents: 345,
      vatToPayCents: 825,
      netPayoutCents: 8225,
    });
    expect(r.saft).toEqual({ invoicedCents: 3390, platformsPaidCents: 10170, differenceCents: 3390 - 10170 });
    expect(r.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/Glovo: sem extratos/), expect.stringMatching(/Comida e embalagem estimadas em 30%/)]));
  });

  it("sem SAF-T: IVA de omissão e aviso", () => {
    const r = buildMarginReport(2026, 9, [uber], [uber]);
    expect(r.salesVatRate).toBe(DEFAULT_SALES_VAT_RATE);
    expect(r.saft).toBeNull();
    expect(r.warnings[0]).toMatch(/Sem SAF-T do mês/);
  });
});
