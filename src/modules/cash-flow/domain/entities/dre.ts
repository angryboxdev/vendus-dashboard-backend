/**
 * DRE do mês a partir da conciliação bancária (decisão do utilizador, 2026-10-26): receita do
 * restaurante pelo Vendus, das plataformas pelo que liquidam no banco (já sem comissão), gastos pelas
 * saídas do banco — tudo sem IVA. Valores em cêntimos.
 */

/** Vendas de um período (sem IVA e o IVA liquidado), em cêntimos. */
export interface SalesFigures {
  netCents: number;
  vatCents: number;
}

export interface ManualAdjustments {
  fixedCents: number;
  variableCents: number;
}

export interface DrePlatformRevenue {
  platform: string;
  /** Liquidado no banco (com IVA, já sem comissão). */
  receivedCents: number;
  netCents: number;
}

export interface DreRevenue {
  /** Restaurante (Vendus: salão, take-away, Eatz), sem IVA. */
  restaurantNetCents: number;
  /** Plataformas: liquidações no banco sem IVA. */
  platformsNetCents: number;
  platformsReceivedCents: number;
  /** Vendido nas plataformas (AirMenu), sem IVA — para comparar com o recebido. */
  platformsSoldNetCents: number;
  /** Vendido sem IVA − recebido sem IVA: comissões e acertos das plataformas (estimativa). */
  platformsCommissionEstimateCents: number;
  /** false quando não há vendas do AirMenu para tirar o IVA: as liquidações contam pelo valor total. */
  platformsVatKnown: boolean;
  byPlatform: DrePlatformRevenue[];
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
  vatCents: number;
  /** Parte contada pelo valor total por não se saber o IVA. */
  pendingVatCents: number;
  children: DreExpenseChild[];
}

export interface DreExpenses {
  totalNetCents: number;
  /** IVA dedutível conhecido (das faturas ou do IVA posto no movimento). */
  vatCents: number;
  /** Gastos contados pelo valor total por falta de IVA («IVA por confirmar»). */
  pendingVatCents: number;
  /** Gastos ainda sem categoria (pelo tipo do banco). */
  unclassifiedCents: number;
  categories: DreExpenseCategory[];
}

export interface DreReport {
  period: { year: number; month: number; from: string; to: string; isCurrentMonth: boolean };
  revenue: DreRevenue;
  expenses: DreExpenses;
  manualAdjustments: ManualAdjustments & { totalCents: number };
  /** Receita − gastos − ajustes manuais (sem IVA). */
  resultCents: number;
  /** Resultado ÷ receita, %, 1 casa decimal; null sem receita. */
  marginPct: number | null;
  vat: {
    /** IVA liquidado nas vendas (Vendus + AirMenu). */
    salesCents: number;
    /** IVA dedutível conhecido dos gastos. */
    purchasesCents: number;
    /** Vendas − compras: estimativa do IVA a entregar (negativo = a recuperar). */
    balanceCents: number;
  };
}
