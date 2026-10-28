import type {
  BankCredit,
  BankDebit,
  CashFlowCategory,
  CashFlowCategoryChild,
  CashFlowDay,
  CashFlowInflowKind,
  CashFlowJustification,
  CashFlowPeriod,
  CashFlowReport,
  CashFlowTotals,
  CostCenterCatalog,
  ExpenseSources,
} from "../entities/cash-flow.js";
import { daysBetween } from "./cash-flow-period.js";
import { categorizeDebit, type ExpenseShare } from "./expense-categorizer.service.js";

/** Grupo de centro de custo fora da DRE (retiradas, transferências internas, IVA, empréstimos). */
const OUT_OF_DRE_GROUP_CODE = "FDR";
const EXCLUDED_JUSTIFICATIONS = new Set(["transferencia_interna", "emprestimo_financiamento"]);
/** Estados resolvidos da conciliação (os mesmos de `bank-statements`). */
const RESOLVED_STATUSES = new Set([
  "conciliado_com_fatura",
  "conciliado_sem_fatura",
  "justificado",
  "transferencia_interna",
  "ignorado_com_motivo",
]);

export interface CashFlowWindowData {
  debits: BankDebit[];
  credits: BankCredit[];
}

export interface BuildCashFlowInput {
  period: CashFlowPeriod;
  current: CashFlowWindowData;
  previous: CashFlowWindowData;
  sources: ExpenseSources;
  catalog: CostCenterCatalog;
}

export interface CountedDebit {
  debit: BankDebit;
  shares: ExpenseShare[];
  amountCents: number;
}

/** Transferências internas e empréstimos não são entradas nem saídas da operação. */
export function isExcluded(m: BankDebit | BankCredit): boolean {
  return (
    m.reconciliationStatus === "transferencia_interna" ||
    (m.justificationType !== null && EXCLUDED_JUSTIFICATIONS.has(m.justificationType)) ||
    m.kind === "internal_transfer"
  );
}

const isLoan = (m: BankDebit) => m.justificationType === "emprestimo_financiamento";

/**
 * Saídas que contam como despesa, já repartidas por categoria (sem o grupo fora da DRE).
 * `loanInterest` (só a DRE): um movimento justificado como empréstimo conta na parte com categoria
 * financeira fora do grupo «Fora da DRE» — os juros; o capital (ex.: FDR.04) continua de fora.
 */
export function countedDebits(
  debits: BankDebit[],
  sources: ExpenseSources,
  catalog: CostCenterCatalog,
  { loanInterest = false }: { loanInterest?: boolean } = {},
): CountedDebit[] {
  const outOfDre = new Set(catalog.groups.filter((g) => g.code === OUT_OF_DRE_GROUP_CODE).map((g) => g.id));
  const financial = new Set(catalog.categories.filter((c) => c.financialType === "financial").map((c) => c.id));
  const out: CountedDebit[] = [];
  for (const debit of debits) {
    const interestOnly = loanInterest && isLoan(debit) && debit.reconciliationStatus !== "transferencia_interna" && debit.kind !== "internal_transfer";
    if (isExcluded(debit) && !interestOnly) continue;
    const shares = categorizeDebit(debit, sources, catalog).filter(
      (s) =>
        s.amountCents > 0 &&
        !(s.groupId && outOfDre.has(s.groupId)) &&
        (!interestOnly || (s.categoryId !== null && financial.has(s.categoryId))),
    );
    const amountCents = shares.reduce((a, s) => a + s.amountCents, 0);
    if (amountCents > 0) out.push({ debit, shares, amountCents });
  }
  return out;
}

/** Fração justificada de uma saída: 1 se resolvida; num pagamento parcial, o valor ligado a documentos. */
function justifiedFraction(m: BankDebit): number {
  if (RESOLVED_STATUSES.has(m.reconciliationStatus)) return 1;
  if (m.reconciliationStatus === "conciliado_parcial" && m.amountCents > 0) {
    const linked = m.links.reduce((a, l) => a + Math.max(l.amountCents, 0), 0);
    return Math.min(1, linked / m.amountCents);
  }
  return 0;
}

function dailySeries(from: string, to: string, credits: BankCredit[], counted: CountedDebit[]): CashFlowDay[] {
  const inflowByDay = new Map<string, number>();
  for (const c of credits) inflowByDay.set(c.date, (inflowByDay.get(c.date) ?? 0) + c.amountCents);
  const outflowByDay = new Map<string, number>();
  for (const c of counted) outflowByDay.set(c.debit.date, (outflowByDay.get(c.debit.date) ?? 0) + c.amountCents);
  return daysBetween(from, to).map((date) => ({
    date,
    inflowCents: inflowByDay.get(date) ?? 0,
    outflowCents: outflowByDay.get(date) ?? 0,
  }));
}

function totals(days: CashFlowDay[]): CashFlowTotals {
  const inflowCents = days.reduce((a, d) => a + d.inflowCents, 0);
  const outflowCents = days.reduce((a, d) => a + d.outflowCents, 0);
  const netCents = inflowCents - outflowCents;
  return {
    inflowCents,
    outflowCents,
    netCents,
    marginPct: inflowCents > 0 ? Math.round((netCents / inflowCents) * 1000) / 10 : null,
  };
}

function inflowKinds(current: BankCredit[], previous: BankCredit[]): CashFlowInflowKind[] {
  const byKind = new Map<string, CashFlowInflowKind>();
  const add = (list: BankCredit[], field: "amountCents" | "previousAmountCents") => {
    for (const c of list) {
      const k = byKind.get(c.kind) ?? { movementKind: c.kind, amountCents: 0, previousAmountCents: 0 };
      k[field] += c.amountCents;
      byKind.set(c.kind, k);
    }
  };
  add(current, "amountCents");
  add(previous, "previousAmountCents");
  return [...byKind.values()].filter((k) => k.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents);
}

function justification(counted: CountedDebit[]): CashFlowJustification {
  let totalCents = 0;
  let justifiedCents = 0;
  let pendingCount = 0;
  for (const c of counted) {
    const fraction = justifiedFraction(c.debit);
    totalCents += c.amountCents;
    justifiedCents += Math.round(c.amountCents * fraction);
    if (fraction < 1) pendingCount += 1;
  }
  return {
    totalCents,
    justifiedCents,
    percent: totalCents > 0 ? Math.floor((justifiedCents / totalCents) * 100) : null,
    pendingCount,
  };
}

const groupKey = (s: ExpenseShare, kind: string) => s.groupId ?? `kind:${kind}`;
const childKey = (s: ExpenseShare) => s.categoryId ?? `${s.groupId}:none`;

function categories(current: CountedDebit[], previous: CountedDebit[], catalog: CostCenterCatalog): CashFlowCategory[] {
  const groups = new Map(catalog.groups.map((g) => [g.id, g]));
  const cats = new Map(catalog.categories.map((c) => [c.id, c]));
  const byKey = new Map<string, CashFlowCategory>();

  const add = (list: CountedDebit[], field: "amountCents" | "previousAmountCents") => {
    for (const c of list) {
      for (const s of c.shares) {
        const key = groupKey(s, c.debit.kind);
        let cat = byKey.get(key);
        if (!cat) {
          const g = s.groupId ? groups.get(s.groupId) : undefined;
          cat = {
            key,
            type: s.groupId ? "group" : "unclassified",
            groupId: s.groupId,
            code: g?.code ?? null,
            name: g?.name ?? null,
            movementKind: s.groupId ? null : c.debit.kind,
            amountCents: 0,
            previousAmountCents: 0,
            children: [],
          };
          byKey.set(key, cat);
        }
        cat[field] += s.amountCents;
        if (!s.groupId) continue;
        const ck = childKey(s);
        let child: CashFlowCategoryChild | undefined = cat.children.find((ch) => ch.key === ck);
        if (!child) {
          const info = s.categoryId ? cats.get(s.categoryId) : undefined;
          child = {
            key: ck,
            categoryId: s.categoryId,
            code: info?.code ?? null,
            name: info?.name ?? null,
            amountCents: 0,
            previousAmountCents: 0,
          };
          cat.children.push(child);
        }
        child[field] += s.amountCents;
      }
    }
  };
  add(current, "amountCents");
  add(previous, "previousAmountCents");

  return [...byKey.values()]
    .filter((c) => c.amountCents > 0)
    .map((c) => ({
      ...c,
      children: c.children.filter((ch) => ch.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents),
    }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

/**
 * Relatório do fluxo de caixa só a partir do banco: séries diárias (entradas e saídas), totais e
 * comparação com o período anterior, entradas por tipo, despesas por centro de custo e quanto das
 * saídas está justificado (por valor).
 * Ficam de fora as transferências internas, os empréstimos e o grupo «Fora da DRE».
 */
export function buildCashFlowReport(input: BuildCashFlowInput): CashFlowReport {
  const { period, sources, catalog } = input;
  const current = countedDebits(input.current.debits, sources, catalog);
  const previous = countedDebits(input.previous.debits, sources, catalog);

  const currentCredits = input.current.credits.filter((c) => !isExcluded(c));
  const previousCredits = input.previous.credits.filter((c) => !isExcluded(c));

  const days = dailySeries(period.from, period.to, currentCredits, current);
  const previousDays = dailySeries(period.previous.from, period.previous.to, previousCredits, previous);

  return {
    period,
    days,
    previousDays,
    totals: totals(days),
    previousTotals: totals(previousDays),
    inflowKinds: inflowKinds(currentCredits, previousCredits),
    categories: categories(current, previous, catalog),
    justification: justification(current),
  };
}
