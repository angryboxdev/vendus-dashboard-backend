import type { BankCredit, BankDebit, CostCenterCatalog, ExpenseSources } from "../entities/cash-flow.js";
import type {
  DreExpenseCategory,
  DreExpenses,
  DrePlatformCosts,
  DrePlatformRevenue,
  DreReport,
  DreRevenue,
  ManualAdjustments,
  RestaurantSales,
} from "../entities/dre.js";
import { DELIVERY_PLATFORMS, type DeliveryPlatformKey, type ResolvedDreParameters } from "../entities/dre-parameters.js";
import { countedDebits, isExcluded } from "./cash-flow-report.service.js";
import type { ExpenseShare } from "./expense-categorizer.service.js";
import { platformGross } from "./platform-gross.service.js";

/** Tipos financeiros que nunca têm IVA (salários e encargos, taxas bancárias, impostos). */
const VAT_EXEMPT_TYPES = new Set(["personnel", "financial", "fiscal"]);

export interface BuildDreInput {
  period: DreReport["period"];
  debits: BankDebit[];
  credits: BankCredit[];
  sources: ExpenseSources;
  catalog: CostCenterCatalog;
  restaurant: RestaurantSales;
  parameters: ResolvedDreParameters;
  /** Rácio sem IVA ÷ com IVA das últimas faturas de cada categoria (IVA estimado). */
  categoryNetRatios: Map<string, number>;
  manual: ManualAdjustments;
}

interface NetShare {
  share: ExpenseShare;
  kind: string;
  netCents: number;
  vatCents: number;
  estimatedVatCents: number;
  pendingVatCents: number;
}

/** Categorias e grupos sem IVA (um grupo só é isento se todas as suas categorias o forem). */
function exemptions(catalog: CostCenterCatalog) {
  const categories = new Set(catalog.categories.filter((c) => VAT_EXEMPT_TYPES.has(c.financialType)).map((c) => c.id));
  const groups = new Set(
    catalog.groups
      .filter((g) => {
        const own = catalog.categories.filter((c) => c.groupId === g.id);
        return own.length > 0 && own.every((c) => categories.has(c.id));
      })
      .map((g) => g.id),
  );
  return (s: ExpenseShare) => (s.categoryId ? categories.has(s.categoryId) : s.groupId ? groups.has(s.groupId) : false);
}

/**
 * Sem IVA de uma parte da saída, pelo melhor que se sabe:
 *  1. categoria sem IVA → tudo;
 *  2. IVA real (fatura conciliada ou IVA posto no movimento) → a fração sem IVA;
 *  3. estimado: média das últimas faturas da categoria; senão, com categoria/grupo, o IVA teórico;
 *  4. sem categoria → conta pelo valor total, como «IVA por confirmar».
 */
function toNet(share: ExpenseShare, exempt: boolean, ratios: Map<string, number>, defaultVatPct: number): Omit<NetShare, "share" | "kind"> {
  const none = { estimatedVatCents: 0, pendingVatCents: 0 };
  if (exempt) return { netCents: share.amountCents, vatCents: 0, ...none };
  if (share.netRatio !== null) {
    const netCents = Math.round(share.amountCents * share.netRatio);
    return { netCents, vatCents: share.amountCents - netCents, ...none };
  }
  const estimate = (share.categoryId ? ratios.get(share.categoryId) : undefined) ?? (share.groupId ? 100 / (100 + defaultVatPct) : null);
  if (estimate !== null) {
    const netCents = Math.round(share.amountCents * estimate);
    const vatCents = share.amountCents - netCents;
    return { netCents, vatCents, estimatedVatCents: vatCents, pendingVatCents: 0 };
  }
  return { netCents: share.amountCents, vatCents: 0, estimatedVatCents: 0, pendingVatCents: share.amountCents };
}

function expenses(input: BuildDreInput): DreExpenses {
  const { debits, sources, catalog } = input;
  const isExempt = exemptions(catalog);
  const shares: NetShare[] = countedDebits(debits, sources, catalog).flatMap((c) =>
    c.shares.map((share) => ({
      share,
      kind: c.debit.kind,
      ...toNet(share, isExempt(share), input.categoryNetRatios, input.parameters.expenseDefaultVatPct),
    })),
  );

  const groups = new Map(catalog.groups.map((g) => [g.id, g]));
  const cats = new Map(catalog.categories.map((c) => [c.id, c]));
  const byKey = new Map<string, DreExpenseCategory>();
  for (const s of shares) {
    const key = s.share.groupId ?? `kind:${s.kind}`;
    let cat = byKey.get(key);
    if (!cat) {
      const g = s.share.groupId ? groups.get(s.share.groupId) : undefined;
      cat = {
        key,
        type: s.share.groupId ? "group" : "unclassified",
        groupId: s.share.groupId,
        code: g?.code ?? null,
        name: g?.name ?? null,
        movementKind: s.share.groupId ? null : s.kind,
        netCents: 0,
        vatCents: 0,
        estimatedVatCents: 0,
        pendingVatCents: 0,
        children: [],
      };
      byKey.set(key, cat);
    }
    cat.netCents += s.netCents;
    cat.vatCents += s.vatCents;
    cat.estimatedVatCents += s.estimatedVatCents;
    cat.pendingVatCents += s.pendingVatCents;
    if (!s.share.groupId) continue;
    const ck = s.share.categoryId ?? `${s.share.groupId}:none`;
    let child = cat.children.find((ch) => ch.key === ck);
    if (!child) {
      const info = s.share.categoryId ? cats.get(s.share.categoryId) : undefined;
      child = { key: ck, categoryId: s.share.categoryId, code: info?.code ?? null, name: info?.name ?? null, netCents: 0, vatCents: 0 };
      cat.children.push(child);
    }
    child.netCents += s.netCents;
    child.vatCents += s.vatCents;
  }

  const categories = [...byKey.values()]
    .map((c) => ({ ...c, children: c.children.sort((a, b) => b.netCents - a.netCents) }))
    .sort((a, b) => b.netCents - a.netCents);
  const sum = (f: (s: NetShare) => number) => shares.reduce((a, s) => a + f(s), 0);
  return {
    totalNetCents: sum((s) => s.netCents),
    vatCents: sum((s) => s.vatCents),
    estimatedVatCents: sum((s) => s.estimatedVatCents),
    pendingVatCents: sum((s) => s.pendingVatCents),
    unclassifiedCents: sum((s) => (s.share.groupId ? 0 : s.netCents)),
    categories,
  };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Restaurante sem IVA repartido pela classe de pagamento, na proporção do bruto. */
function restaurantByPayment(r: RestaurantSales): DreRevenue["restaurantByPayment"] {
  const { card, cash, other } = r.byPaymentGrossCents;
  const total = card + cash + other;
  if (total <= 0) return { cardNetCents: 0, cashNetCents: 0, otherNetCents: r.netCents };
  const cardNetCents = Math.round((r.netCents * card) / total);
  const cashNetCents = Math.round((r.netCents * cash) / total);
  return { cardNetCents, cashNetCents, otherNetCents: r.netCents - cardNetCents - cashNetCents };
}

/**
 * Plataformas reconstituídas em bruto a partir do que liquidam no banco (já sem comissão nem marketing)
 * e do marketing lançado à mão — ver `platformGross`. Uma plataforma só com marketing também aparece.
 */
function platforms(credits: BankCredit[], p: ResolvedDreParameters): DrePlatformRevenue[] {
  const received = new Map<string, number>();
  for (const c of credits) {
    if (!c.platform || isExcluded(c)) continue;
    received.set(c.platform, (received.get(c.platform) ?? 0) + c.amountCents);
  }
  const keys = new Set<string>([...received.keys(), ...DELIVERY_PLATFORMS.filter((k) => p.marketingNetCents[k] > 0)]);
  return [...keys]
    .map((platform) => {
      const receivedCents = received.get(platform) ?? 0;
      const marketingNetCents = p.marketingNetCents[platform as DeliveryPlatformKey] ?? 0;
      const g = platformGross(receivedCents, marketingNetCents, p);
      const contributionCents = g.netCents - g.commissionNetCents - marketingNetCents;
      return { platform, receivedCents, marketingNetCents, ...g, contributionCents, contributionPct: pct(contributionCents, g.netCents) };
    })
    .sort((a, b) => b.grossCents - a.grossCents);
}

/**
 * DRE do mês a partir da conciliação bancária: receita (restaurante pelo Vendus; plataformas em bruto,
 * reconstituídas das liquidações), custos das plataformas (comissão e marketing), gastos (saídas do
 * banco categorizadas como no fluxo de caixa) e ajustes manuais, tudo sem IVA; e o saldo do IVA.
 */
export function buildDreReport(input: BuildDreInput): DreReport {
  const byPlatform = platforms(input.credits, input.parameters);
  const sumP = (f: (p: DrePlatformRevenue) => number) => byPlatform.reduce((a, p) => a + f(p), 0);
  const platformsNetCents = sumP((p) => p.netCents);
  const revenue: DreRevenue = {
    restaurantNetCents: input.restaurant.netCents,
    restaurantByPayment: restaurantByPayment(input.restaurant),
    platformsGrossCents: sumP((p) => p.grossCents),
    platformsNetCents,
    platformsReceivedCents: sumP((p) => p.receivedCents),
    byPlatform,
    totalNetCents: input.restaurant.netCents + platformsNetCents,
  };
  const platformCosts: DrePlatformCosts = {
    commissionNetCents: sumP((p) => p.commissionNetCents),
    marketingNetCents: sumP((p) => p.marketingNetCents),
    totalNetCents: sumP((p) => p.commissionNetCents + p.marketingNetCents),
  };
  const exp = expenses(input);
  const manualTotal = input.manual.fixedCents + input.manual.variableCents;
  const resultCents = revenue.totalNetCents - platformCosts.totalNetCents - exp.totalNetCents - manualTotal;

  const salesVat = input.restaurant.vatCents + sumP((p) => p.salesVatCents);
  const purchasesVat = exp.vatCents + sumP((p) => p.commissionVatCents + p.marketingVatCents);
  return {
    period: input.period,
    parameters: input.parameters,
    revenue,
    platformCosts,
    expenses: exp,
    manualAdjustments: { ...input.manual, totalCents: manualTotal },
    resultCents,
    marginPct: pct(resultCents, revenue.totalNetCents),
    vat: {
      salesCents: salesVat,
      purchasesCents: purchasesVat,
      purchasesEstimatedCents: exp.estimatedVatCents,
      balanceCents: salesVat - purchasesVat,
    },
  };
}
