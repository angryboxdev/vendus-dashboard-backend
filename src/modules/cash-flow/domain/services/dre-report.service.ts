import type { BankCredit, BankDebit, CostCenterCatalog, ExpenseSources } from "../entities/cash-flow.js";
import type {
  DreExpenseCategory,
  DreExpenses,
  DrePlatformRevenue,
  DreReport,
  DreRevenue,
  ManualAdjustments,
  SalesFigures,
} from "../entities/dre.js";
import { countedDebits, isExcluded } from "./cash-flow-report.service.js";
import type { ExpenseShare } from "./expense-categorizer.service.js";

/** Tipos financeiros que nunca têm IVA (salários e encargos, taxas bancárias, impostos). */
const VAT_EXEMPT_TYPES = new Set(["personnel", "financial", "fiscal"]);

export interface BuildDreInput {
  period: DreReport["period"];
  debits: BankDebit[];
  credits: BankCredit[];
  sources: ExpenseSources;
  catalog: CostCenterCatalog;
  restaurant: SalesFigures;
  /** Vendas das plataformas no AirMenu (sem IVA + IVA) — dão a taxa de IVA das liquidações. */
  platformsSold: SalesFigures;
  manual: ManualAdjustments;
}

interface NetShare {
  share: ExpenseShare;
  kind: string;
  netCents: number;
  vatCents: number;
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
 * Sem IVA de uma parte da saída: categoria sem IVA → tudo; IVA conhecido (fatura conciliada ou IVA
 * posto no movimento) → a fração sem IVA; senão conta pelo valor total, como «IVA por confirmar».
 */
function toNet(share: ExpenseShare, exempt: boolean): Omit<NetShare, "share" | "kind"> {
  if (exempt) return { netCents: share.amountCents, vatCents: 0, pendingVatCents: 0 };
  if (share.netRatio !== null) {
    const netCents = Math.round(share.amountCents * share.netRatio);
    return { netCents, vatCents: share.amountCents - netCents, pendingVatCents: 0 };
  }
  return { netCents: share.amountCents, vatCents: 0, pendingVatCents: share.amountCents };
}

function expenses(debits: BankDebit[], sources: ExpenseSources, catalog: CostCenterCatalog): DreExpenses {
  const isExempt = exemptions(catalog);
  const shares: NetShare[] = countedDebits(debits, sources, catalog).flatMap((c) =>
    c.shares.map((share) => ({ share, kind: c.debit.kind, ...toNet(share, isExempt(share)) })),
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
        pendingVatCents: 0,
        children: [],
      };
      byKey.set(key, cat);
    }
    cat.netCents += s.netCents;
    cat.vatCents += s.vatCents;
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
    pendingVatCents: sum((s) => s.pendingVatCents),
    unclassifiedCents: sum((s) => (s.share.groupId ? 0 : s.netCents)),
    categories,
  };
}

/**
 * Plataformas pelo que liquidam no banco (já sem comissão), sem IVA pela taxa das vendas do AirMenu
 * no período; a diferença para o vendido (AirMenu sem IVA) é a estimativa de comissões e acertos.
 */
function revenue(credits: BankCredit[], restaurant: SalesFigures, sold: SalesFigures): DreRevenue {
  const soldGross = sold.netCents + sold.vatCents;
  const netRatio = soldGross > 0 ? sold.netCents / soldGross : null;
  const byPlatform = new Map<string, DrePlatformRevenue>();
  for (const c of credits) {
    if (!c.platform || isExcluded(c)) continue;
    const p = byPlatform.get(c.platform) ?? { platform: c.platform, receivedCents: 0, netCents: 0 };
    p.receivedCents += c.amountCents;
    byPlatform.set(c.platform, p);
  }
  for (const p of byPlatform.values()) p.netCents = netRatio === null ? p.receivedCents : Math.round(p.receivedCents * netRatio);

  const platforms = [...byPlatform.values()].sort((a, b) => b.receivedCents - a.receivedCents);
  const platformsNetCents = platforms.reduce((a, p) => a + p.netCents, 0);
  return {
    restaurantNetCents: restaurant.netCents,
    platformsNetCents,
    platformsReceivedCents: platforms.reduce((a, p) => a + p.receivedCents, 0),
    platformsSoldNetCents: sold.netCents,
    platformsCommissionEstimateCents: Math.max(0, sold.netCents - platformsNetCents),
    platformsVatKnown: netRatio !== null,
    byPlatform: platforms,
    totalNetCents: restaurant.netCents + platformsNetCents,
  };
}

/**
 * DRE do mês a partir da conciliação bancária: receita (restaurante pelo Vendus; plataformas pelas
 * liquidações no banco), gastos (saídas do banco categorizadas como no fluxo de caixa) e ajustes
 * manuais, tudo sem IVA; e o saldo do IVA (vendas − compras).
 */
export function buildDreReport(input: BuildDreInput): DreReport {
  const rev = revenue(input.credits, input.restaurant, input.platformsSold);
  const exp = expenses(input.debits, input.sources, input.catalog);
  const manualTotal = input.manual.fixedCents + input.manual.variableCents;
  const resultCents = rev.totalNetCents - exp.totalNetCents - manualTotal;
  const salesVat = input.restaurant.vatCents + input.platformsSold.vatCents;
  return {
    period: input.period,
    revenue: rev,
    expenses: exp,
    manualAdjustments: { ...input.manual, totalCents: manualTotal },
    resultCents,
    marginPct: rev.totalNetCents > 0 ? Math.round((resultCents / rev.totalNetCents) * 1000) / 10 : null,
    vat: { salesCents: salesVat, purchasesCents: exp.vatCents, balanceCents: salesVat - exp.vatCents },
  };
}
