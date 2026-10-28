/**
 * Parâmetros mensais da DRE (decisões do utilizador, 2026-10-27): reconstituir o delivery em bruto a
 * partir do que as plataformas liquidam, a taxa do TPA da conferência de vendas e o IVA teórico dos
 * gastos sem fatura. Percentagens (ex.: 15 = 15%); marketing em cêntimos, sem IVA.
 */

export type DeliveryPlatformKey = "uber_eats" | "glovo" | "bolt_food";
export const DELIVERY_PLATFORMS: DeliveryPlatformKey[] = ["uber_eats", "glovo", "bolt_food"];

export interface DreParameters {
  /** IVA médio das vendas de delivery (comida 13% + bebida 23% → ≈ 15%). */
  deliverySalesVatPct: number;
  /** Comissão das plataformas sobre a venda. */
  platformCommissionPct: number;
  /** IVA que a plataforma cobra sobre a comissão. */
  platformCommissionVatPct: number;
  /** A comissão incide sobre a venda com IVA (true) ou sem IVA (false). */
  commissionOnGross: boolean;
  /** IVA cobrado sobre o marketing das plataformas. */
  marketingVatPct: number;
  /** Taxa do TPA esperada na conferência de vendas. */
  cardFeePct: number;
  /** IVA teórico dos gastos classificados sem fatura nem histórico (ex.: serviços 23%). */
  expenseDefaultVatPct: number;
  /** Marketing das plataformas no mês, sem IVA (lançado à mão). */
  marketingNetCents: Record<DeliveryPlatformKey, number>;
  /**
   * Despesa de empréstimos do mês (DE do «Controle geral»), lançada à mão: prestações de empréstimos fora
   * da operação que não passam pelo banco. Não entra na DRE.
   */
  loanExpenseCents: number;
  /**
   * Renda variável do «Controle geral» (contrato do espaço): `rentVariablePct`% da faturação do mês acima
   * de `rentThresholdCents` (ex.: 8% acima de 19 000 €). 0% = sem renda variável. Não entra na DRE.
   */
  rentThresholdCents: number;
  rentVariablePct: number;
}

/** De onde vêm as taxas: do próprio mês, herdadas do último mês com valores, ou as de omissão. */
export type DreParametersSource = "month" | "inherited" | "default";

export interface ResolvedDreParameters extends DreParameters {
  source: DreParametersSource;
}

export const DEFAULT_DRE_PARAMETERS: DreParameters = {
  deliverySalesVatPct: 15,
  platformCommissionPct: 30,
  platformCommissionVatPct: 23,
  commissionOnGross: true,
  marketingVatPct: 23,
  // 0%: o banco credita o TPA em bruto e cobra a comissão num débito à parte (setembro de 2026, taxa
  // implícita −0,1%), que já entra nos gastos bancários. Pôr a taxa só se o TPA liquidar com desconto.
  cardFeePct: 0,
  expenseDefaultVatPct: 23,
  marketingNetCents: { uber_eats: 0, glovo: 0, bolt_food: 0 },
  loanExpenseCents: 0,
  rentThresholdCents: 0,
  rentVariablePct: 0,
};
