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

/**
 * Resultado de uma plataforma no mês pelos extratos importados (módulo `delivery-platforms`): vendas a
 * preço de tabela e custos, sem IVA, já só com a parte do mês. Quando existe, a DRE usa-o em vez de
 * reconstituir a plataforma pelo banco (F3b).
 */
export interface DeliveryStatementResult {
  platform: string;
  salesGrossCents: number;
  salesNetCents: number;
  /** IVA das vendas (sobre o que os clientes pagaram, depois das promoções). */
  salesVatCents: number;
  promotionsNetCents: number;
  commissionNetCents: number;
  commissionVatCents: number;
  marketingNetCents: number;
  /** IVA do marketing e das outras taxas. */
  marketingVatCents: number;
  /** Outras taxas (sem IVA) + reembolsos. */
  otherNetCents: number;
}

/**
 * Uma plataforma: pelos extratos importados (`source: "statements"`) ou reconstituída a partir do que
 * liquidou no banco (`"bank"`, ver `platformGross`).
 */
export interface DrePlatformRevenue {
  platform: string;
  source: "statements" | "bank";
  /** Liquidado no banco (já sem comissão nem marketing). */
  receivedCents: number;
  /** Marketing sem IVA: dos extratos, ou lançado à mão (banco). */
  marketingNetCents: number;
  /** Venda com IVA (preço de tabela nos extratos; reconstituída pelo banco). */
  grossCents: number;
  /** Venda sem IVA (receita da DRE). */
  netCents: number;
  /** Promoções pagas pelo restaurante, sem IVA (só pelos extratos; 0 pelo banco). */
  promotionsNetCents: number;
  /** Outras taxas e reembolsos, sem IVA (só pelos extratos). */
  otherFeesNetCents: number;
  salesVatCents: number;
  commissionNetCents: number;
  commissionVatCents: number;
  marketingVatCents: number;
  /** Venda sem IVA − promoções − comissão − marketing − outras taxas: o que sobra para o produto e o resto. */
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

/** Custos das plataformas, sem IVA — retidos na liquidação, entram como gasto. */
export interface DrePlatformCosts {
  commissionNetCents: number;
  marketingNetCents: number;
  /** Promoções pagas pelo restaurante (só pelos extratos). */
  promotionsNetCents: number;
  /** Outras taxas e reembolsos (só pelos extratos). */
  otherFeesNetCents: number;
  totalNetCents: number;
}

/**
 * Comissão do TPA: o banco liquida as vendas em cartão já sem ela, por isso nunca aparece como saída.
 * Estimada pela taxa do mês (`cardFeePct`, a mesma da conferência de vendas) sobre o vendido em cartão
 * (Vendus, com IVA). Sem IVA dedutível (serviço financeiro).
 */
export interface DreCardFees {
  /** Vendido em cartão no Vendus, com IVA. */
  cardGrossCents: number;
  ratePct: number;
  netCents: number;
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
  /** IVA dedutível dos gastos desta linha (real + estimado); 0 no que está com o IVA por apurar. */
  vatCents: number;
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
  /** Saídas fora da operação (não entram em `totalNetCents` nem no resultado). */
  offOperation: DreOffOperation;
  /** Faturas do mês ainda por pagar incluídas nos gastos (quantas e quanto, sem IVA). */
  unpaidInvoices: { count: number; netCents: number };
}

/**
 * Fora da operação: o grupo «Fora da DRE» (retiradas de sócios, capital de empréstimos, cauções), pelo
 * valor pago. Sem as transferências internas nem o IVA (tem o seu painel). O CAPEX fica na sua linha.
 */
export interface DreOffOperation {
  totalCents: number;
  items: DreSectionItem[];
}

/** De onde vem o valor sem IVA de um pagamento: isento, IVA real, estimado ou por confirmar. */
export type DreVatBasis = "exempt" | "real" | "estimated" | "pending";

/** Um pagamento (ou parte dele) por trás de uma rubrica da DRE — para conferir. */
export interface DreEntry {
  section: DreSectionKey | "off_operation";
  /** `DreSectionItem.key` da rubrica. */
  itemKey: string;
  /** Movimento do banco (ou, numa fatura por pagar, um id próprio). */
  movementId: string;
  /** Data do pagamento no banco; null = fatura ainda por pagar. */
  paidOn: string | null;
  /** Data que decide o mês: a do documento conciliado, senão a do pagamento. */
  competenceDate: string;
  /** Descrição legível do extrato. */
  description: string | null;
  /** Fornecedor e número da fatura (ou nome do contrato recorrente). */
  document: string | null;
  /** De onde vem a categoria: o próprio movimento, o documento conciliado ou só o tipo do extrato. */
  basis: "movement" | "document" | "extract";
  /** Parte do pagamento, com IVA. */
  grossCents: number;
  netCents: number;
  vatBasis: DreVatBasis;
}

/** Pagamentos da DRE do mês — contrato de `GET /reports/dre/pagamentos`. */
export interface DreEntries {
  period: DreReport["period"];
  entries: DreEntry[];
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
  /** Comissão do TPA (zero no pedido rápido, sem as vendas do restaurante). */
  cardFees: DreCardFees;
  expenses: DreExpenses;
  /** Receita − custos das plataformas − comissão do TPA − gastos do banco, sem o CAPEX (sem IVA). */
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
  /** Comissão do TPA sobre as vendas em cartão do mês (pela taxa dos parâmetros). */
  cardFees: DreCardFees;
}
