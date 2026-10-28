/**
 * Fluxo de caixa do mês só a partir do banco: entradas (créditos) contra saídas (débitos) de todas as
 * contas da organização, com as saídas repartidas por centro de custo. Tudo em cêntimos.
 */

/** Entrada do banco (crédito) já com o tipo genérico calculado a partir do descritivo. */
export interface BankCredit {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Magnitude positiva. */
  amountCents: number;
  /** Tipo genérico do banco (ex.: «sales», «transfer_in»). */
  kind: string;
  /** Liquidação de uma plataforma de entrega (uber_eats, glovo, bolt_food), já sem comissão; senão null. */
  platform: string | null;
  /** Venda do restaurante: «card» = liquidação TPA, «cash» = depósito; senão null/ausente. */
  restaurantSale?: "card" | "cash" | null;
  reconciliationStatus: string;
  justificationType: string | null;
}

/** Saída do banco (débito) já com o tipo genérico calculado a partir do descritivo. */
export interface BankDebit {
  id: string;
  /** YYYY-MM-DD (data-valor do extrato). */
  date: string;
  /** Magnitude positiva. */
  amountCents: number;
  /** Tipo genérico do banco (ex.: «transfer_out»), usado quando o movimento não tem categoria. */
  kind: string;
  reconciliationStatus: string;
  justificationType: string | null;
  matchedEntityType: string | null;
  matchedEntityId: string | null;
  /** Categoria posta no próprio movimento (classificação manual ou regra recorrente). */
  groupId: string | null;
  categoryId: string | null;
  /** IVA posto no movimento ao justificá-lo sem fatura (percentagem, ex.: 23); null = não indicado. */
  vatRate: number | null;
  /** O valor do movimento inclui esse IVA (por omissão, sim). */
  vatIncluded: boolean | null;
  /** Ligações a faturas / contas a pagar (conciliação com um ou vários documentos). */
  links: BankDebitLink[];
  /** Descrição legível do extrato (só para listar os pagamentos da DRE). */
  label?: string;
}

export interface BankDebitLink {
  entityType: "invoice" | "payable_entry";
  entityId: string;
  /** Parte do movimento atribuída a este documento. */
  amountCents: number;
}

/** Repartição de uma fatura por categoria (peso relativo, normalmente o líquido de cada parte). */
export interface CategoryWeight {
  groupId: string | null;
  categoryId: string | null;
  weight: number;
  /** Parte sem IVA do valor pago (ex.: 100/123); null = IVA desconhecido. */
  netRatio?: number | null;
}

export interface InvoiceCategoryData {
  mode: "simple" | "detailed" | "by_values";
  groupId: string | null;
  categoryId: string | null;
  /** Total sem IVA ÷ total com IVA da fatura; null sem total. */
  netRatio: number | null;
  /** Repartições do modo «Por valores». */
  allocations: CategoryWeight[];
  /** Linhas do modo «Por artigo». */
  lines: CategoryWeight[];
  /** Data de competência da fatura (a de competência, senão a da fatura), YYYY-MM-DD. */
  date?: string | null;
  /** Fornecedor e número, para listar. */
  label?: string | null;
}

/** Documentos a que as saídas estão conciliadas, com o que é preciso para lhes tirar a categoria. */
export interface ExpenseSources {
  invoices: Map<string, InvoiceCategoryData>;
  payables: Map<string, { invoiceId: string | null; groupId: string | null }>;
  occurrences: Map<
    string,
    {
      invoiceId: string | null;
      groupId: string | null;
      categoryId: string | null;
      /** Mês a que a ocorrência respeita, YYYY-MM. */
      period?: string | null;
      /** Nome do contrato, para listar. */
      label?: string | null;
    }
  >;
}

export interface ExpenseReferences {
  invoiceIds: string[];
  payableIds: string[];
  occurrenceIds: string[];
}

export interface CostCenterGroupInfo {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
}

export interface CostCenterCategoryInfo {
  id: string;
  groupId: string;
  code: string;
  name: string;
  /** cmv, personnel, fixed_opex, financial, fiscal… (decide, p. ex., se tem IVA). */
  financialType: string;
}

export interface CostCenterCatalog {
  groups: CostCenterGroupInfo[];
  categories: CostCenterCategoryInfo[];
}

// ─── Resultado ────────────────────────────────────────────────────────────────

export interface CashFlowDay {
  date: string;
  inflowCents: number;
  outflowCents: number;
}

export interface CashFlowTotals {
  inflowCents: number;
  outflowCents: number;
  /** Entradas − saídas. */
  netCents: number;
  /** Resultado ÷ entradas, em %, 1 casa decimal; null sem entradas. */
  marginPct: number | null;
}

/** Entradas agrupadas pelo tipo genérico do banco (vendas, transferências recebidas…). */
export interface CashFlowInflowKind {
  movementKind: string;
  amountCents: number;
  previousAmountCents: number;
}

export interface CashFlowCategoryChild {
  key: string;
  categoryId: string | null;
  code: string | null;
  name: string | null;
  amountCents: number;
  previousAmountCents: number;
}

export interface CashFlowCategory {
  key: string;
  /** «group»: centro de custo; «unclassified»: saída sem categoria, agrupada pelo tipo genérico do banco. */
  type: "group" | "unclassified";
  groupId: string | null;
  code: string | null;
  name: string | null;
  /** Só em «unclassified». */
  movementKind: string | null;
  amountCents: number;
  previousAmountCents: number;
  children: CashFlowCategoryChild[];
}

export interface CashFlowJustification {
  totalCents: number;
  justifiedCents: number;
  /** Inteiro 0–100; null sem saídas. */
  percent: number | null;
  /** Saídas ainda por conciliar ou justificar. */
  pendingCount: number;
}

export interface CashFlowPeriod {
  year: number;
  month: number;
  /** Primeiro dia do mês. */
  from: string;
  /** Último dia com dados: hoje no mês corrente, senão o fim do mês. */
  to: string;
  monthEnd: string;
  isCurrentMonth: boolean;
  /** Mesmos dias do mês anterior (ou o mês anterior inteiro, num mês fechado). */
  previous: { from: string; to: string };
}

export interface CashFlowReport {
  period: CashFlowPeriod;
  days: CashFlowDay[];
  previousDays: CashFlowDay[];
  totals: CashFlowTotals;
  previousTotals: CashFlowTotals;
  inflowKinds: CashFlowInflowKind[];
  categories: CashFlowCategory[];
  justification: CashFlowJustification;
}

// ─── Para tratar (estado atual, não depende do mês) ───────────────────────────

export interface CashFlowToHandle {
  /** Contas a pagar em aberto (pendentes + em atraso) e só as em atraso. */
  payables: { dueCents: number; overdueCents: number };
  /** Faturas importadas ainda por rever/confirmar. */
  invoicesToReview: number;
}
