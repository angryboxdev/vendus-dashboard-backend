import type { BankCredit, BankDebit, CostCenterCatalog, ExpenseSources, UnpaidInvoice } from "../entities/cash-flow.js";
import type {
  DreCardFees,
  DreEntry,
  DreExpenseCategory,
  DreExpenseSection,
  DreOffOperation,
  DreSectionItem,
  DreSectionKey,
  DreExpenses,
  DrePlatformCosts,
  DrePlatformRevenue,
  DreReport,
  DreRevenue,
  DreVatBasis,
  RestaurantSales,
} from "../entities/dre.js";
import { DELIVERY_PLATFORMS, type DeliveryPlatformKey, type ResolvedDreParameters } from "../entities/dre-parameters.js";
import { isExcluded } from "./cash-flow-report.service.js";
import { categorizeDebit, type ExpenseShare } from "./expense-categorizer.service.js";
import { platformGross } from "./platform-gross.service.js";

/** Tipos financeiros que nunca têm IVA (salários e encargos, taxas bancárias, impostos). */
const VAT_EXEMPT_TYPES = new Set(["personnel", "financial", "fiscal"]);
/** Grupo de centro de custo fora da DRE (retiradas, transferências internas, IVA, empréstimos, cauções). */
const OUT_OF_DRE_GROUP_CODE = "FDR";
/** Fora do bloco «Fora da operação»: transferências internas (não saem da empresa) e IVA (tem o seu painel). */
const HIDDEN_OFF_OPERATION_TYPES = new Set(["internal_transfer", "fiscal"]);

export interface BuildDreInput {
  period: DreReport["period"];
  /**
   * Saídas do banco de uma janela à volta do mês: cada parte conta no mês da sua competência — a data
   * do documento conciliado (fatura; ocorrência de recorrência → o seu mês), senão a do pagamento.
   */
  debits: BankDebit[];
  credits: BankCredit[];
  sources: ExpenseSources;
  catalog: CostCenterCatalog;
  restaurant: RestaurantSales;
  /** false: sem as vendas do restaurante (pedido rápido) — resultado e margem ficam null. */
  restaurantSalesLoaded?: boolean;
  parameters: ResolvedDreParameters;
  /** Rácio sem IVA ÷ com IVA das últimas faturas de cada categoria (IVA estimado). */
  categoryNetRatios: Map<string, number>;
  /** Faturas do mês ainda por pagar (sem movimento conciliado): entram como gasto do mês. */
  unpaidInvoices?: UnpaidInvoice[];
}

/** Uma parte de uma saída já colocada no mês, com o valor sem IVA. */
interface NetShare {
  share: ExpenseShare;
  debit: BankDebit;
  competenceDate: string;
  netCents: number;
  vatCents: number;
  estimatedVatCents: number;
  pendingVatCents: number;
  vatBasis: DreVatBasis;
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
function toNet(
  share: ExpenseShare,
  exempt: boolean,
  ratios: Map<string, number>,
  defaultVatPct: number,
): Pick<NetShare, "netCents" | "vatCents" | "estimatedVatCents" | "pendingVatCents" | "vatBasis"> {
  const none = { estimatedVatCents: 0, pendingVatCents: 0 };
  if (exempt) return { netCents: share.amountCents, vatCents: 0, ...none, vatBasis: "exempt" };
  if (share.netRatio !== null) {
    const netCents = Math.round(share.amountCents * share.netRatio);
    return { netCents, vatCents: share.amountCents - netCents, ...none, vatBasis: "real" };
  }
  const estimate = (share.categoryId ? ratios.get(share.categoryId) : undefined) ?? (share.groupId ? 100 / (100 + defaultVatPct) : null);
  if (estimate !== null) {
    const netCents = Math.round(share.amountCents * estimate);
    const vatCents = share.amountCents - netCents;
    return { netCents, vatCents, estimatedVatCents: vatCents, pendingVatCents: 0, vatBasis: "estimated" };
  }
  return { netCents: share.amountCents, vatCents: 0, estimatedVatCents: 0, pendingVatCents: share.amountCents, vatBasis: "pending" };
}

const lastDayOfMonth = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;

/**
 * Coloca as saídas no mês e separa a operação do que fica fora dela:
 *  - transferências internas não contam;
 *  - cada parte conta no mês da sua competência (documento conciliado, senão a data do pagamento);
 *  - grupo «Fora da DRE» (retiradas de sócios, capital de empréstimos, cauções) → fora da operação;
 *  - empréstimo: só a parte com categoria financeira fora do FDR (juros) é gasto; o resto é capital.
 */
/** Id das «saídas» que representam faturas por pagar (não são movimentos do banco). */
const UNPAID_PREFIX = "fatura-por-pagar:";
export const isUnpaidEntry = (id: string) => id.startsWith(UNPAID_PREFIX);

/**
 * Faturas do mês por pagar como saídas ainda por fazer, conciliadas com a própria fatura: passam pelas
 * mesmas regras (categoria, IVA da fatura, competência) que um pagamento conciliado.
 */
function withUnpaidInvoices(input: BuildDreInput): { debits: BankDebit[]; sources: ExpenseSources } {
  const unpaid = input.unpaidInvoices ?? [];
  if (unpaid.length === 0) return { debits: input.debits, sources: input.sources };
  const invoices = new Map(input.sources.invoices);
  const debits = [...input.debits];
  for (const inv of unpaid) {
    invoices.set(inv.id, inv.data);
    debits.push({
      id: `${UNPAID_PREFIX}${inv.id}`,
      date: inv.data.date ?? input.period.from,
      amountCents: inv.totalCents,
      kind: "supplier",
      reconciliationStatus: "por_pagar",
      justificationType: null,
      matchedEntityType: "invoice",
      matchedEntityId: inv.id,
      groupId: null,
      categoryId: null,
      vatRate: null,
      vatIncluded: null,
      links: [],
    });
  }
  return { debits, sources: { ...input.sources, invoices } };
}

function classify(input: BuildDreInput): { operating: NetShare[]; offOperation: NetShare[] } {
  const { catalog, period } = input;
  const { debits, sources } = withUnpaidInvoices(input);
  const monthEnd = lastDayOfMonth(period.year, period.month);
  const outOfDre = new Set(catalog.groups.filter((g) => g.code === OUT_OF_DRE_GROUP_CODE).map((g) => g.id));
  const typeOf = new Map(catalog.categories.map((c) => [c.id, c.financialType]));
  const isExempt = exemptions(catalog);
  const operating: NetShare[] = [];
  const offOperation: NetShare[] = [];
  for (const debit of debits) {
    const loan = debit.justificationType === "emprestimo_financiamento";
    if (isExcluded(debit) && !loan) continue;
    if (debit.reconciliationStatus === "transferencia_interna" || debit.kind === "internal_transfer") continue;
    for (const share of categorizeDebit(debit, sources, catalog)) {
      if (share.amountCents <= 0) continue;
      const competenceDate = share.document?.date ?? debit.date;
      if (competenceDate < period.from || competenceDate > monthEnd) continue;
      const type = share.categoryId ? typeOf.get(share.categoryId) : undefined;
      if ((share.groupId !== null && outOfDre.has(share.groupId)) || (loan && type !== "financial")) {
        if (type && HIDDEN_OFF_OPERATION_TYPES.has(type)) continue;
        // Fora da operação conta pelo valor pago (sem IVA a separar).
        offOperation.push({ share, debit, competenceDate, netCents: share.amountCents, vatCents: 0, estimatedVatCents: 0, pendingVatCents: 0, vatBasis: "exempt" });
        continue;
      }
      operating.push({ share, debit, competenceDate, ...toNet(share, isExempt(share), input.categoryNetRatios, input.parameters.expenseDefaultVatPct) });
    }
  }
  return { operating, offOperation };
}

function expenses(shares: NetShare[], offShares: NetShare[], catalog: CostCenterCatalog): DreExpenses {
  const groups = new Map(catalog.groups.map((g) => [g.id, g]));
  const cats = new Map(catalog.categories.map((c) => [c.id, c]));
  const byKey = new Map<string, DreExpenseCategory>();
  for (const s of shares) {
    const key = s.share.groupId ?? `kind:${s.debit.kind}`;
    let cat = byKey.get(key);
    if (!cat) {
      const g = s.share.groupId ? groups.get(s.share.groupId) : undefined;
      cat = {
        key,
        type: s.share.groupId ? "group" : "unclassified",
        groupId: s.share.groupId,
        code: g?.code ?? null,
        name: g?.name ?? null,
        movementKind: s.share.groupId ? null : s.debit.kind,
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
  const sections = dreSections(shares, catalog);
  const offItems = sortedItems(groupItems(offShares, (s) => offOperationPlacement(s, catalog)).get("off_operation"));
  const offOperation: DreOffOperation = { totalCents: offItems.reduce((a, i) => a + i.netCents, 0), items: offItems };
  return {
    totalNetCents: sum((s) => s.netCents),
    vatCents: sum((s) => s.vatCents),
    estimatedVatCents: sum((s) => s.estimatedVatCents),
    pendingVatCents: sum((s) => s.pendingVatCents),
    unclassifiedCents: sum((s) => (s.share.groupId ? 0 : s.netCents)),
    categories,
    sections,
    capexNetCents: sections.find((s) => s.key === "capex")?.netCents ?? 0,
    offOperation,
    unpaidInvoices: {
      count: new Set(shares.filter((s) => isUnpaidEntry(s.debit.id)).map((s) => s.debit.id)).size,
      netCents: sum((s) => (isUnpaidEntry(s.debit.id) ? s.netCents : 0)),
    },
  };
}

/** Tipo financeiro da categoria → linha da DRE. */
const SECTION_BY_TYPE: Record<string, DreSectionKey> = {
  cmv: "cmv",
  variable_cost: "variable",
  personnel: "personnel",
  fixed_opex: "structure",
  administrative: "administrative",
  marketing: "marketing",
  financial: "financial",
  capex: "capex",
};
/**
 * Sem fatura nem categoria, a saída fica com a classificação genérica do extrato (decisão do
 * utilizador, 2026-10-27): os tipos inequívocos vão para a sua linha; o resto («Outros gastos pelo
 * extrato»: transferências, compras com cartão, Estado…) fica em `unclassified`, pelo tipo do banco.
 */
const SECTION_BY_MOVEMENT_KIND: Record<string, DreSectionKey> = {
  payroll: "personnel",
  utilities: "structure",
  insurance: "administrative",
  bank_fee: "financial",
};
const SECTION_ORDER: DreSectionKey[] = ["cmv", "variable", "personnel", "structure", "administrative", "marketing", "other", "unclassified", "financial", "capex"];

/** Linha e rubrica (item) onde uma parte entra. */
interface Placement {
  section: DreSectionKey | "off_operation";
  item: Omit<DreSectionItem, "netCents">;
}

/**
 * Gastos pelas linhas da DRE: pela categoria; sem categoria, pelo grupo quando todas as suas categorias
 * são do mesmo tipo (senão «outros»); sem grupo, pelo tipo genérico do extrato (`SECTION_BY_MOVEMENT_KIND`).
 */
function operatingPlacement(s: NetShare, catalog: CostCenterCatalog): Placement {
  const { categoryId, groupId } = s.share;
  const cat = categoryId ? catalog.categories.find((c) => c.id === categoryId) : undefined;
  const groupSection = (id: string): DreSectionKey => {
    const types = new Set(catalog.categories.filter((c) => c.groupId === id).map((c) => SECTION_BY_TYPE[c.financialType] ?? "other"));
    return types.size === 1 ? [...types][0]! : "other";
  };
  const section: DreSectionKey = cat
    ? (SECTION_BY_TYPE[cat.financialType] ?? "other")
    : groupId
      ? groupSection(groupId)
      : (SECTION_BY_MOVEMENT_KIND[s.debit.kind] ?? "unclassified");
  return { section, item: itemOf(s, catalog) };
}

/** Fora da operação: por categoria; um empréstimo sem categoria fica em «Empréstimos (capital)». */
function offOperationPlacement(s: NetShare, catalog: CostCenterCatalog): Placement {
  const item = itemOf(s, catalog);
  if (!s.share.groupId && s.debit.justificationType === "emprestimo_financiamento") {
    return { section: "off_operation", item: { ...item, key: "loan", name: "Empréstimos (capital)", movementKind: null } };
  }
  return { section: "off_operation", item };
}

function itemOf(s: NetShare, catalog: CostCenterCatalog): Omit<DreSectionItem, "netCents"> {
  const { categoryId, groupId } = s.share;
  const cat = categoryId ? catalog.categories.find((c) => c.id === categoryId) : undefined;
  const g = groupId ? catalog.groups.find((x) => x.id === groupId) : undefined;
  return {
    key: cat ? cat.id : groupId ? `${groupId}:none` : `kind:${s.debit.kind}`,
    categoryId: cat?.id ?? null,
    code: cat?.code ?? g?.code ?? null,
    name: cat?.name ?? g?.name ?? null,
    movementKind: groupId ? null : s.debit.kind,
  };
}

function groupItems(shares: NetShare[], place: (s: NetShare) => Placement): Map<string, Map<string, DreSectionItem>> {
  const bySection = new Map<string, Map<string, DreSectionItem>>();
  for (const s of shares) {
    const { section, item } = place(s);
    const items = bySection.get(section) ?? new Map<string, DreSectionItem>();
    bySection.set(section, items);
    const current = items.get(item.key) ?? { ...item, netCents: 0 };
    current.netCents += s.netCents;
    items.set(item.key, current);
  }
  return bySection;
}

const sortedItems = (items: Map<string, DreSectionItem> | undefined) => [...(items?.values() ?? [])].sort((a, b) => b.netCents - a.netCents);

function dreSections(shares: NetShare[], catalog: CostCenterCatalog): DreExpenseSection[] {
  const bySection = groupItems(shares, (s) => operatingPlacement(s, catalog));
  return SECTION_ORDER.filter((k) => bySection.has(k)).map((key) => {
    const items = sortedItems(bySection.get(key));
    return { key, netCents: items.reduce((a, i) => a + i.netCents, 0), items };
  });
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Restaurante sem IVA repartido pela classe de pagamento, na proporção do bruto. */
export function restaurantByPayment(r: RestaurantSales): DreRevenue["restaurantByPayment"] {
  const { card, cash, other } = r.byPaymentGrossCents;
  const total = card + cash + other;
  if (total <= 0) return { cardNetCents: 0, cashNetCents: 0, otherNetCents: r.netCents };
  const cardNetCents = Math.round((r.netCents * card) / total);
  const cashNetCents = Math.round((r.netCents * cash) / total);
  return { cardNetCents, cashNetCents, otherNetCents: r.netCents - cardNetCents - cashNetCents };
}

/** Comissão do TPA: taxa do mês sobre o vendido em cartão (ver `DreCardFees`). */
export function cardFees(r: RestaurantSales, p: Pick<ResolvedDreParameters, "cardFeePct">): DreCardFees {
  const cardGrossCents = r.byPaymentGrossCents.card;
  return { cardGrossCents, ratePct: p.cardFeePct, netCents: Math.round((cardGrossCents * p.cardFeePct) / 100) };
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
 * reconstituídas das liquidações), custos das plataformas (comissão e marketing), comissão do TPA,
 * gastos (saídas do banco no mês da competência) e o que fica fora da operação, tudo sem IVA; e o
 * saldo do IVA.
 */
export function buildDreReport(input: BuildDreInput): DreReport {
  const loaded = input.restaurantSalesLoaded ?? true;
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
  const { operating, offOperation } = classify(input);
  const exp = expenses(operating, offOperation, input.catalog);
  const fees = cardFees(input.restaurant, input.parameters);
  // CAPEX é investimento: aparece na DRE, mas fora do resultado.
  const resultCents = revenue.totalNetCents - platformCosts.totalNetCents - fees.netCents - (exp.totalNetCents - exp.capexNetCents);

  const salesVat = input.restaurant.vatCents + sumP((p) => p.salesVatCents);
  const purchasesVat = exp.vatCents + sumP((p) => p.commissionVatCents + p.marketingVatCents);
  return {
    period: input.period,
    restaurantSalesLoaded: loaded,
    parameters: input.parameters,
    revenue,
    platformCosts,
    cardFees: fees,
    expenses: exp,
    resultCents: loaded ? resultCents : null,
    marginPct: loaded ? pct(resultCents, revenue.totalNetCents) : null,
    vat: {
      salesCents: salesVat,
      purchasesCents: purchasesVat,
      purchasesEstimatedCents: exp.estimatedVatCents,
      balanceCents: salesVat - purchasesVat,
    },
  };
}

/**
 * Os pagamentos por trás de cada rubrica da DRE (linha + item), para conferir: a mesma colocação de
 * `buildDreReport`, uma entrada por parte de cada saída, por data de competência.
 */
export function buildDreEntries(input: BuildDreInput): DreEntry[] {
  const { operating, offOperation } = classify(input);
  const entry = (s: NetShare, p: Placement): DreEntry => ({
    section: p.section,
    itemKey: p.item.key,
    movementId: s.debit.id,
    paidOn: isUnpaidEntry(s.debit.id) ? null : s.debit.date,
    competenceDate: s.competenceDate,
    description: s.debit.label ?? null,
    document: s.share.document?.label ?? null,
    basis: s.debit.groupId !== null || s.debit.categoryId !== null ? "movement" : s.share.groupId !== null ? "document" : "extract",
    grossCents: s.share.amountCents,
    netCents: s.netCents,
    vatBasis: s.vatBasis,
  });
  return [
    ...operating.map((s) => entry(s, operatingPlacement(s, input.catalog))),
    ...offOperation.map((s) => entry(s, offOperationPlacement(s, input.catalog))),
  ].sort((a, b) => a.competenceDate.localeCompare(b.competenceDate) || (a.paidOn ?? "").localeCompare(b.paidOn ?? "") || b.grossCents - a.grossCents);
}
