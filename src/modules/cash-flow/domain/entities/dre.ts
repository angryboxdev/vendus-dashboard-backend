import type { ResolvedDreParameters } from "./dre-parameters.js";

/**
 * DRE do mês a partir da conciliação bancária (decisões do utilizador, 2026-10-26/27): receita do
 * restaurante pelo Vendus, das plataformas reconstituída em bruto a partir do que liquidam no banco,
 * gastos pelas saídas do banco — tudo sem IVA. Valores em cêntimos.
 */

/** Vendas de um período (sem IVA e o IVA liquidado), em cêntimos. */
export interface SalesFigures {
  netCents: number;
  vatCents: number;
}

/** Vendas do restaurante com o bruto por classe de pagamento (para separar a receita). */
export interface RestaurantSales extends SalesFigures {
  byPaymentGrossCents: { card: number; cash: number; other: number };
}

/** Uma plataforma: o que liquidou no banco e a venda reconstituída (ver `platformGross`). */
export interface DrePlatformRevenue {
  platform: string;
  /** Liquidado no banco (já sem comissão nem marketing). */
  receivedCents: number;
  /** Marketing lançado à mão, sem IVA. */
  marketingNetCents: number;
  /** Venda reconstituída, com IVA. */
  grossCents: number;
  /** Venda sem IVA (receita da DRE). */
  netCents: number;
  salesVatCents: number;
  commissionNetCents: number;
  commissionVatCents: number;
  marketingVatCents: number;
  /** Venda sem IVA − comissão − marketing: o que sobra para o produto e o resto. */
  contributionCents: number;
  /** Contribuição ÷ venda sem IVA, %; null sem venda. */
  contributionPct: number | null;
}

export interface DreRevenue {
  /** Restaurante (Vendus: salão, take-away, Eatz), sem IVA. */
  restaurantNetCents: number;
  /** Restaurante repartido pela classe de pagamento (proporção do bruto). */
  restaurantByPayment: { cardNetCents: number; cashNetCents: number; otherNetCents: number };
  /** Plataformas: venda reconstituída com IVA, sem IVA, e o liquidado no banco. */
  platformsGrossCents: number;
  platformsNetCents: number;
  platformsReceivedCents: number;
  byPlatform: DrePlatformRevenue[];
  totalNetCents: number;
}

/** Comissões e marketing das plataformas, sem IVA — retidos na liquidação, entram como gasto. */
export interface DrePlatformCosts {
  commissionNetCents: number;
  marketingNetCents: number;
  totalNetCents: number;
}

export interface DreExpenseChild {
  key: string;
  categoryId: string | null;
  code: string | null;
  name: string | null;
  netCents: number;
  vatCents: number;
}

export interface DreExpenseCategory {
  key: string;
  type: "group" | "unclassified";
  groupId: string | null;
  code: string | null;
  name: string | null;
  movementKind: string | null;
  netCents: number;
  /** IVA dedutível (real + estimado). */
  vatCents: number;
  /** Parte do IVA estimada (média das faturas da categoria ou IVA teórico). */
  estimatedVatCents: number;
  /** Parte contada pelo valor total por não se saber o IVA. */
  pendingVatCents: number;
  children: DreExpenseChild[];
}

/**
 * Linha da DRE onde um gasto entra, pelo tipo financeiro da categoria: CMV, custos variáveis, pessoal,
 * estrutura, administrativo, marketing, financeiro, CAPEX (fora do resultado), outros (grupo misto sem
 * categoria) e por classificar (sem categoria).
 */
export type DreSectionKey =
  | "cmv"
  | "variable"
  | "personnel"
  | "structure"
  | "administrative"
  | "marketing"
  | "financial"
  | "capex"
  | "other"
  | "unclassified";

export interface DreSectionItem {
  key: string;
  categoryId: string | null;
  code: string | null;
  /** Nome da categoria (ou do grupo, sem categoria); null nas saídas por classificar. */
  name: string | null;
  /** Tipo genérico do banco, nas saídas por classificar. */
  movementKind: string | null;
  netCents: number;
}

export interface DreExpenseSection {
  key: DreSectionKey;
  netCents: number;
  items: DreSectionItem[];
}

export interface DreExpenses {
  totalNetCents: number;
  /** IVA dedutível: real (faturas, IVA no movimento) + estimado. */
  vatCents: number;
  /** Parte estimada do IVA: média das últimas faturas da categoria, ou IVA teórico. */
  estimatedVatCents: number;
  /** Gastos contados pelo valor total por falta de IVA («IVA por confirmar»). */
  pendingVatCents: number;
  /** Gastos ainda sem categoria (pelo tipo do banco). */
  unclassifiedCents: number;
  categories: DreExpenseCategory[];
  /** Os mesmos gastos arrumados pelas linhas da DRE (só as com valor, pela ordem da DRE). */
  sections: DreExpenseSection[];
  /** Investimentos (CAPEX): incluídos em `totalNetCents`, mas fora do resultado. */
  capexNetCents: number;
}

export interface DreReport {
  period: { year: number; month: number; from: string; to: string; isCurrentMonth: boolean };
  /**
   * false = pedido rápido sem as vendas do restaurante (Vendus): a receita do restaurante vem a zero e
   * o resultado, a margem e o IVA das vendas não estão completos (`resultCents` / `marginPct` = null).
   */
  restaurantSalesLoaded: boolean;
  /** Parâmetros usados (taxas do delivery, IVA teórico, marketing) e de onde vêm. */
  parameters: ResolvedDreParameters;
  revenue: DreRevenue;
  platformCosts: DrePlatformCosts;
  expenses: DreExpenses;
  /** Receita − custos das plataformas − gastos do banco, sem o CAPEX (sem IVA). */
  resultCents: number | null;
  /** Resultado ÷ receita, %, 1 casa decimal; null sem receita. */
  marginPct: number | null;
  vat: {
    /** IVA liquidado nas vendas (Vendus + plataformas reconstituídas). */
    salesCents: number;
    /** IVA dedutível dos gastos e das comissões/marketing das plataformas (real + estimado). */
    purchasesCents: number;
    /** Parte estimada de `purchasesCents`. */
    purchasesEstimatedCents: number;
    /** Vendas − compras: estimativa do IVA a entregar (negativo = a recuperar). */
    balanceCents: number;
  };
}

/** Só as vendas do restaurante do mês (Vendus), sem IVA — a parte lenta da DRE, pedida à parte. */
export interface DreRestaurantSales {
  period: DreReport["period"];
  netCents: number;
  vatCents: number;
  byPayment: DreRevenue["restaurantByPayment"];
}
