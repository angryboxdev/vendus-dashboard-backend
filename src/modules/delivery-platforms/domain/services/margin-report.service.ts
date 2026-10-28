import type { MarginReport, PlatformMargin } from "../entities/margin-report.js";
import type { DeliveryPlatform, StatementLine } from "../entities/platform-statement.js";
import type { StoredPlatformStatement } from "../ports/out/platform-statement-repository.port.js";
import { allocateToMonth, type AllocatedStatement } from "./month-allocation.js";

/** IVA médio das vendas sem SAF-T no mês (o mesmo de omissão da DRE: comida 13% + bebida 23%). */
export const DEFAULT_SALES_VAT_RATE = 0.15;
/** Hipótese do custo da comida e embalagem até o custo real vir das fichas técnicas. */
export const FOOD_COST_PCT = 30;

const PLATFORMS: Exclude<DeliveryPlatform, "airmenu">[] = ["uber_eats", "glovo", "bolt_food"];
const NAMES: Record<Exclude<DeliveryPlatform, "airmenu">, string> = { uber_eats: "Uber Eats", glovo: "Glovo", bolt_food: "Bolt Food" };

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const sum = (lines: StatementLine[], kinds: StatementLine["kind"][], field: "grossCents" | "vatCents" = "grossCents") =>
  lines.filter((l) => kinds.includes(l.kind)).reduce((a, l) => a + l[field], 0);

/** Margem de um conjunto de documentos já repartidos (uma plataforma, ou todas para o total). */
function margin(platform: PlatformMargin["platform"], docs: AllocatedStatement[], vatRate: number): PlatformMargin {
  const lines = docs.flatMap((d) => d.lines);
  const salesGrossCents = sum(lines, ["sales"]);
  const promotionsGrossCents = sum(lines, ["promotion"]);
  const fees = (k: StatementLine["kind"]) => sum(lines, [k]) - sum(lines, [k], "vatCents");
  const feesVatCents = sum(lines, ["commission", "marketing", "other_fee"], "vatCents");
  const salesNetCents = Math.round(salesGrossCents / (1 + vatRate));
  const promotionsNetCents = Math.round(promotionsGrossCents / (1 + vatRate));
  const invoicedNetCents = salesNetCents - promotionsNetCents;
  const paidByCustomersCents = salesGrossCents - promotionsGrossCents;
  const commissionNetCents = fees("commission");
  const marketingNetCents = fees("marketing");
  const otherNetCents = fees("other_fee") + sum(lines, ["refund"]);
  const grossMarginCents = invoicedNetCents - commissionNetCents - marketingNetCents - otherNetCents;
  const foodCostCents = Math.round((invoicedNetCents * FOOD_COST_PCT) / 100);
  const netMarginCents = grossMarginCents - foodCostCents;
  const ordersCount = docs.reduce((a, d) => a + d.ordersCount, 0);
  const salesVatCents = paidByCustomersCents - invoicedNetCents;
  return {
    platform,
    documents: docs.length,
    ordersCount,
    salesGrossCents,
    promotionsGrossCents,
    paidByCustomersCents,
    platformFeesGrossCents: sum(lines, ["commission", "marketing", "other_fee", "refund"]),
    feesVatCents,
    cashCents: sum(lines, ["cash"]),
    netPayoutCents: docs.reduce((a, d) => a + d.netPayoutCents, 0),
    salesNetCents,
    promotionsNetCents,
    invoicedNetCents,
    salesVatCents,
    commissionNetCents,
    marketingNetCents,
    otherNetCents,
    grossMarginCents,
    grossMarginPct: pct(grossMarginCents, salesNetCents),
    foodCostCents,
    netMarginCents,
    netMarginPct: pct(netMarginCents, salesNetCents),
    netMarginPerOrderCents: ordersCount > 0 ? Math.round(netMarginCents / ordersCount) : null,
    vatToPayCents: salesVatCents - feesVatCents,
  };
}

/**
 * Relatório do mês: reparte os documentos pelo mês (`allocateToMonth`), tira o IVA das vendas pela taxa
 * do SAF-T do mês (ou a de omissão) e calcula as margens por plataforma e no total.
 * `statements` — documentos que tocam o mês; `context` — os que tocam qualquer dia desses documentos.
 */
export function buildMarginReport(
  year: number,
  month: number,
  statements: StoredPlatformStatement[],
  context: StoredPlatformStatement[],
): MarginReport {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const allocated = allocateToMonth(statements, context, from, to);

  const saftLines = allocated.filter((a) => a.statement.platform === "airmenu").flatMap((a) => a.lines);
  const saftSales = sum(saftLines, ["sales"]);
  const saftVat = sum(saftLines, ["sales"], "vatCents");
  const fromSaft = saftSales > saftVat && saftVat > 0;
  const vatRate = fromSaft ? saftVat / (saftSales - saftVat) : DEFAULT_SALES_VAT_RATE;

  const platformDocs = allocated.filter((a) => a.statement.platform !== "airmenu");
  const platforms = PLATFORMS.map((p) => margin(p, platformDocs.filter((a) => a.statement.platform === p), vatRate)).filter((m) => m.documents > 0);
  const total = margin("total", platformDocs, vatRate);

  const warnings: string[] = [];
  if (!fromSaft) warnings.push(`Sem SAF-T do mês: IVA das vendas estimado em ${Math.round(DEFAULT_SALES_VAT_RATE * 100)}%.`);
  for (const a of allocated.filter((x) => x.meta.basis === "days")) {
    warnings.push(`${a.meta.documentNumber}: repartido pela proporção de dias (falta o SAF-T de algum dia do período) — estimativa.`);
  }
  const bolt = platformDocs.filter((a) => a.statement.platform === "bolt_food");
  if (bolt.some((a) => a.statement.documentKind === "bolt_orders_report") && !bolt.some((a) => a.statement.documentKind === "bolt_weekly_invoice")) {
    warnings.push("Bolt Food: faltam as faturas semanais — comissões e campanhas não contadas.");
  }
  if (bolt.some((a) => a.statement.documentKind === "bolt_weekly_invoice") && !bolt.some((a) => a.statement.documentKind === "bolt_orders_report")) {
    warnings.push("Bolt Food: falta o relatório de pedidos — vendas não contadas.");
  }
  for (const p of PLATFORMS) {
    if (!platforms.some((m) => m.platform === p)) warnings.push(`${NAMES[p]}: sem extratos no mês.`);
  }
  warnings.push(`Comida e embalagem estimadas em ${FOOD_COST_PCT}% do faturado sem IVA — o custo real virá das fichas técnicas.`);

  return {
    period: { year, month, from, to },
    salesVatRate: vatRate,
    salesVatRateSource: fromSaft ? "saft" : "default",
    foodCostPct: FOOD_COST_PCT,
    platforms,
    total,
    saft: fromSaft
      ? { invoicedCents: saftSales - sum(saftLines, ["refund"]), platformsPaidCents: total.paidByCustomersCents, differenceCents: saftSales - sum(saftLines, ["refund"]) - total.paidByCustomersCents }
      : null,
    documents: allocated.map((a) => a.meta),
    warnings,
  };
}
