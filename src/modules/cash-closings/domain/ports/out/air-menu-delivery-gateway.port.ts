export interface DeliveryTotals {
  /** Receita bruta líquida de NCs da plataforma Uber Eats para um dado dia. */
  uber: number;
  /** Receita bruta líquida de NCs da plataforma Glovo para um dado dia. */
  glovo: number;
  /** Receita bruta líquida de NCs da plataforma Bolt Food para um dado dia. */
  bolt: number;
}

/**
 * Port de saída: totais de delivery externos (AirMenu) para reconciliação no fecho de caixa.
 * O domínio não conhece AirMenu — apenas esta interface.
 */
export interface AirMenuDeliveryGatewayPort {
  getDeliveryTotalsForDate(date: string): Promise<DeliveryTotals>;
}
