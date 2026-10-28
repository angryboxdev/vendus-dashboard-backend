import type { PlatformBankCredit } from "../../domain/entities/payout-reconciliation.js";
import type { PlatformStatement } from "../../domain/entities/platform-statement.js";
import type { StoredPlatformStatement } from "../../domain/ports/out/platform-statement-repository.port.js";
import { buildPayoutReconciliation } from "../../domain/services/payout-reconciliation.service.js";

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
const credit = (id: string, platform: PlatformBankCredit["platform"], date: string, amountCents: number): PlatformBankCredit => ({ id, platform, date, amountCents });

const uber = doc({
  platform: "uber_eats",
  documentKind: "uber_monthly_statement",
  documentNumber: "UBERTEST",
  periodFrom: "2026-09-01",
  periodTo: "2026-09-30",
  payouts: [
    { periodFrom: "2026-08-31", periodTo: "2026-09-06", paidOn: "2026-09-07", netCents: 10_000 },
    { periodFrom: "2026-09-07", periodTo: "2026-09-13", paidOn: "2026-09-14", netCents: 20_000 },
  ],
});
const glovo = (n: string, from: string, to: string, net: number) =>
  doc({ platform: "glovo", documentKind: "glovo_statement", documentNumber: n, periodFrom: from, periodTo: to, payouts: [{ periodFrom: from, periodTo: to, paidOn: null, netCents: net }] });

describe("buildPayoutReconciliation", () => {
  it("liga cada transferência ao crédito da plataforma: igual, com diferença, por receber", () => {
    const r = buildPayoutReconciliation(
      2026,
      9,
      [uber, glovo("G1", "2026-09-01", "2026-09-15", 30_000), glovo("G2", "2026-09-16", "2026-09-30", 37_000)],
      [
        credit("a", "uber_eats", "2026-09-07", 10_000),
        credit("b", "uber_eats", "2026-09-14", 20_001),
        credit("c", "glovo", "2026-09-03", 22_000),
        credit("d", "glovo", "2026-09-18", 35_000),
      ],
      "2026-09-30",
    );
    expect(r.payouts.map((p) => [p.platform, p.periodTo, p.status, p.received?.date ?? null, p.differenceCents])).toEqual([
      ["glovo", "2026-09-15", "difference", "2026-09-18", 5_000],
      ["glovo", "2026-09-30", "pending", null, null],
      ["uber_eats", "2026-09-06", "ok", "2026-09-07", 0],
      ["uber_eats", "2026-09-13", "ok", "2026-09-14", 1],
    ]);
    // O crédito de 3/09 paga a quinzena de agosto: fica sem transferência esperada neste mês.
    expect(r.unmatchedCredits.map((c) => c.id)).toEqual(["c"]);
    expect(r.totals.find((t) => t.platform === "glovo")).toEqual({ platform: "glovo", expectedCents: 67_000, receivedCents: 35_000, differenceCents: 5_000, pendingCents: 37_000 });
    expect(r.warnings).toEqual([expect.stringMatching(/Banco importado só até 2026-09-30/)]);
  });

  it("depois da janela e com o banco importado: em falta", () => {
    const r = buildPayoutReconciliation(2026, 9, [glovo("G2", "2026-09-16", "2026-09-30", 37_000)], [], "2026-10-31");
    expect(r.payouts[0]).toMatchObject({ status: "missing", dueBy: "2026-10-21" });
    expect(r.warnings).toEqual([]);
  });

  it("um crédito de valor muito diferente não se liga", () => {
    const r = buildPayoutReconciliation(2026, 9, [glovo("G1", "2026-09-01", "2026-09-15", 30_000)], [credit("x", "glovo", "2026-09-18", 90_000)], "2026-10-31");
    expect(r.payouts[0]!.status).toBe("missing");
    expect(r.unmatchedCredits.map((c) => c.id)).toEqual(["x"]);
  });

  it("Bolt: vendas da semana (sem as pagas em dinheiro) − total da fatura; sem relatório de pedidos, aviso", () => {
    const orders = doc({
      platform: "bolt_food",
      documentKind: "bolt_orders_report",
      documentNumber: "PEDIDOS",
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      lines: [
        { kind: "sales", label: "a", grossCents: 3_000, vatCents: 0, date: "2026-09-02" },
        { kind: "cash", label: "b", grossCents: 1_000, vatCents: 0, date: "2026-09-02" },
        { kind: "sales", label: "c", grossCents: 5_000, vatCents: 0, date: "2026-09-20" },
      ],
    });
    const invoice = doc({
      platform: "bolt_food",
      documentKind: "bolt_weekly_invoice",
      documentNumber: "PT9999-1",
      periodFrom: "2026-08-31",
      periodTo: "2026-09-06",
      netPayoutCents: -660,
    });
    const r = buildPayoutReconciliation(2026, 9, [orders, invoice], [credit("b1", "bolt_food", "2026-09-07", 1_340)], "2026-09-30");
    expect(r.payouts[0]).toMatchObject({ platform: "bolt_food", expectedCents: 3_000 - 1_000 - 660, status: "ok" });

    const alone = buildPayoutReconciliation(2026, 9, [invoice], [credit("b1", "bolt_food", "2026-09-07", 1_340)], "2026-09-30");
    expect(alone.payouts).toEqual([]);
    expect(alone.warnings).toEqual([expect.stringMatching(/falta o relatório de pedidos/), expect.stringMatching(/Bolt Food: há créditos no banco/)]);
  });
});
