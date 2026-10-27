/**
 * Conferência das vendas do restaurante (Vendus) com o que entra no banco: cartão ↔ créditos TPA,
 * numerário ↔ depósitos. Tudo em cêntimos.
 */

/** Vendas de um dia no Vendus por classe de pagamento. */
export interface DailyRestaurantPayments {
  /** YYYY-MM-DD. */
  date: string;
  cardCents: number;
  cashCents: number;
}

/**
 * Um crédito TPA (ou vários no mesmo dia, de terminais diferentes) e os dias de venda que cobre:
 * do dia do crédito anterior até à véspera deste (venda em D, crédito em D+1; fim de semana junto).
 */
export interface CardSettlement {
  creditDate: string;
  salesFrom: string;
  salesTo: string;
  soldCents: number;
  receivedCents: number;
  /** Vendido − recebido (taxa do TPA e acertos). */
  differenceCents: number;
  /** Diferença ÷ vendido, em % (1 casa); null sem vendas. */
  impliedFeePct: number | null;
  /** «ok» = taxa dentro da tolerância; «check» = fora; «no_sales» = crédito sem vendas no Vendus. */
  status: "ok" | "check" | "no_sales";
}

export interface CashDeposit {
  date: string;
  depositedCents: number;
  /** Numerário vendido desde o depósito anterior até à véspera deste. */
  soldSincePreviousCents: number;
}

export interface SalesReconciliationDay {
  date: string;
  cardSoldCents: number;
  cardReceivedCents: number;
  cashSoldCents: number;
  cashDepositedCents: number;
}

export interface SalesReconciliation {
  period: { year: number; month: number; from: string; to: string; isCurrentMonth: boolean };
  /** Taxa do TPA esperada (%), e a tolerância aceite à volta dela (pontos percentuais). */
  expectedCardFeePct: number;
  feeTolerancePct: number;
  card: {
    /** Vendido em cartão no Vendus nos dias do mês. */
    soldCents: number;
    /** Créditos TPA das liquidações cujo último dia de venda cai no mês. */
    receivedCents: number;
    /** Vendido nos dias cobertos por essas liquidações (par de `receivedCents`). */
    settledSoldCents: number;
    differenceCents: number;
    impliedFeePct: number | null;
    /** Taxa esperada sobre `settledSoldCents`. */
    expectedFeeCents: number;
    settlements: CardSettlement[];
    /** Vendas em cartão depois do último crédito (ainda por liquidar); null se não houver. */
    pending: { from: string; to: string; soldCents: number } | null;
  };
  cash: {
    soldCents: number;
    depositedCents: number;
    /** Vendido − depositado no mês (positivo = numerário por depositar). */
    notDepositedCents: number;
    deposits: CashDeposit[];
  };
  days: SalesReconciliationDay[];
}
