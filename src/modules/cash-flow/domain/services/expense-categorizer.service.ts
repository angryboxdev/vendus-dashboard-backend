import type {
  BankDebit,
  CategoryWeight,
  CostCenterCatalog,
  ExpenseReferences,
  ExpenseSources,
  InvoiceCategoryData,
} from "../entities/cash-flow.js";

/** Parte de uma saída atribuída a uma categoria; grupo e categoria a null = sem categoria. */
export interface ExpenseShare {
  groupId: string | null;
  categoryId: string | null;
  amountCents: number;
  /** Parte sem IVA deste valor (da fatura ou do IVA posto no movimento); null = IVA desconhecido. */
  netRatio: number | null;
  /** Documento que justifica esta parte (fatura ou ocorrência de recorrência); null = só o extrato. */
  document: ExpenseDocument | null;
}

/** Data de competência (YYYY-MM-DD) e nome de um documento conciliado. */
export interface ExpenseDocument {
  date: string | null;
  label: string | null;
}

type Weighted = CategoryWeight & { document: ExpenseDocument | null };

const UNKNOWN: CategoryWeight = { groupId: null, categoryId: null, weight: 1, netRatio: null };

/** IVA posto no próprio movimento: 23 % incluído → 100/123; «não incluído» → todo o valor é base. */
function movementNetRatio(m: BankDebit): number | null {
  if (m.vatRate === null || m.vatRate < 0) return null;
  return m.vatIncluded === false ? 1 : 100 / (100 + m.vatRate);
}

/** Uma saída usa a categoria do próprio movimento antes da dos documentos conciliados. */
function hasOwnCategory(m: BankDebit): boolean {
  return m.groupId !== null || m.categoryId !== null;
}

/**
 * Documentos que é preciso ler para categorizar estas saídas. `withOwnCategory` (DRE): também os das
 * saídas com categoria própria — a categoria não muda, mas a data de competência vem do documento.
 */
export function collectExpenseReferences(debits: BankDebit[], { withOwnCategory = false }: { withOwnCategory?: boolean } = {}): ExpenseReferences {
  const invoices = new Set<string>();
  const payables = new Set<string>();
  const occurrences = new Set<string>();
  for (const m of debits) {
    if (hasOwnCategory(m) && !withOwnCategory) continue;
    for (const l of m.links) (l.entityType === "invoice" ? invoices : payables).add(l.entityId);
    if (m.links.length > 0 || !m.matchedEntityId) continue;
    if (m.matchedEntityType === "invoice") invoices.add(m.matchedEntityId);
    else if (m.matchedEntityType === "payable_entry") payables.add(m.matchedEntityId);
    else if (m.matchedEntityType === "recurrence_occurrence") occurrences.add(m.matchedEntityId);
  }
  return { invoiceIds: [...invoices], payableIds: [...payables], occurrenceIds: [...occurrences] };
}

/**
 * Repartição de uma fatura conforme o modo de classificação: «Por valores» → repartições;
 * «Por artigo» → linhas (sem categoria na linha → a do cabeçalho); «Única» → cabeçalho.
 */
export function invoiceSplit(inv: InvoiceCategoryData): CategoryWeight[] {
  const header: CategoryWeight = { groupId: inv.groupId, categoryId: inv.categoryId, weight: 1, netRatio: inv.netRatio };
  // Sem IVA próprio (repartições), a parte usa o rácio da fatura.
  const withRatio = (p: CategoryWeight): CategoryWeight => ({ ...p, netRatio: p.netRatio ?? inv.netRatio });
  const parts =
    inv.mode === "by_values"
      ? inv.allocations.map(withRatio)
      : inv.mode === "detailed"
        ? inv.lines.map((l) =>
            withRatio(l.groupId === null && l.categoryId === null ? { ...header, weight: l.weight, netRatio: l.netRatio ?? null } : l),
          )
        : [];
  const usable = parts.filter((p) => p.weight > 0);
  return usable.length > 0 ? usable : [header];
}

function entitySplit(entityType: string, entityId: string, sources: ExpenseSources): CategoryWeight[] {
  const fromInvoice = (invoiceId: string | null) => {
    const inv = invoiceId ? sources.invoices.get(invoiceId) : undefined;
    return inv ? invoiceSplit(inv) : null;
  };
  if (entityType === "invoice") return fromInvoice(entityId) ?? [UNKNOWN];
  if (entityType === "payable_entry") {
    const p = sources.payables.get(entityId);
    if (!p) return [UNKNOWN];
    return fromInvoice(p.invoiceId) ?? [{ groupId: p.groupId, categoryId: null, weight: 1, netRatio: null }];
  }
  if (entityType === "recurrence_occurrence") {
    const o = sources.occurrences.get(entityId);
    if (!o) return [UNKNOWN];
    return fromInvoice(o.invoiceId) ?? [{ groupId: o.groupId, categoryId: o.categoryId, weight: 1, netRatio: null }];
  }
  return [UNKNOWN];
}

/** Documento de uma ligação: a fatura (direta, da conta a pagar ou da ocorrência), senão o mês da ocorrência. */
function entityDocument(entityType: string, entityId: string, sources: ExpenseSources): ExpenseDocument | null {
  const ofInvoice = (invoiceId: string | null) => {
    const inv = invoiceId ? sources.invoices.get(invoiceId) : undefined;
    return inv ? { date: inv.date ?? null, label: inv.label ?? null } : null;
  };
  if (entityType === "invoice") return ofInvoice(entityId);
  if (entityType === "payable_entry") return ofInvoice(sources.payables.get(entityId)?.invoiceId ?? null);
  if (entityType === "recurrence_occurrence") {
    const o = sources.occurrences.get(entityId);
    if (!o) return null;
    return ofInvoice(o.invoiceId) ?? { date: o.period ? `${o.period}-01` : null, label: o.label ?? null };
  }
  return null;
}

/** Documentos da saída, pela ordem: ligações, senão o match único. */
function debitDocuments(m: BankDebit, sources: ExpenseSources): ExpenseDocument[] {
  const refs = m.links.length > 0 ? m.links : m.matchedEntityType && m.matchedEntityId ? [{ entityType: m.matchedEntityType, entityId: m.matchedEntityId }] : [];
  return refs.map((r) => entityDocument(r.entityType, r.entityId, sources)).filter((d): d is ExpenseDocument => d !== null);
}

/** Reparte `total` pelos pesos, em cêntimos inteiros (maiores restos), somando sempre `total`. */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let rest = total - out.reduce((a, v) => a + v, 0);
  const order = exact.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k]!.i]! += 1;
  return out;
}

/**
 * Categoria(s) de uma saída, por prioridade: 1) a do movimento (manual ou regra recorrente);
 * 2) a dos documentos conciliados (faturas, contas a pagar), na proporção do valor ligado a cada um;
 * 3) a da ocorrência de recorrência / documento associado; 4) nenhuma.
 * Cada parte leva também a fração sem IVA, para a DRE.
 * O grupo sai sempre da categoria quando esta é conhecida; um grupo que não está no catálogo
 * (ex.: centro de custo antigo) conta como sem categoria.
 */
export function categorizeDebit(m: BankDebit, sources: ExpenseSources, catalog: CostCenterCatalog): ExpenseShare[] {
  let weights: Weighted[];
  if (hasOwnCategory(m)) {
    // Categoria do movimento; a data vem do (primeiro) documento conciliado, se houver.
    const document = debitDocuments(m, sources)[0] ?? null;
    weights = [{ groupId: m.groupId, categoryId: m.categoryId, weight: 1, netRatio: movementNetRatio(m), document }];
  } else if (m.links.length > 0) {
    weights = m.links.flatMap((l) => {
      const split = entitySplit(l.entityType, l.entityId, sources);
      const document = entityDocument(l.entityType, l.entityId, sources);
      const splitSum = split.reduce((a, s) => a + s.weight, 0) || 1;
      return split.map((s) => ({ ...s, weight: (Math.max(l.amountCents, 0) * s.weight) / splitSum, document }));
    });
  } else if (m.matchedEntityType && m.matchedEntityId) {
    const document = entityDocument(m.matchedEntityType, m.matchedEntityId, sources);
    weights = entitySplit(m.matchedEntityType, m.matchedEntityId, sources).map((s) => ({ ...s, document }));
  } else {
    weights = [{ ...UNKNOWN, document: null }];
  }

  const groupOf = new Map(catalog.categories.map((c) => [c.id, c.groupId]));
  const knownGroups = new Set(catalog.groups.map((g) => g.id));
  const amounts = distribute(m.amountCents, weights.map((w) => w.weight));
  return weights.map((w, i) => {
    const categoryGroup = w.categoryId ? groupOf.get(w.categoryId) : undefined;
    const groupId = categoryGroup ?? (w.groupId && knownGroups.has(w.groupId) ? w.groupId : null);
    return { groupId, categoryId: categoryGroup ? w.categoryId : null, amountCents: amounts[i]!, netRatio: w.netRatio ?? null, document: w.document };
  });
}
