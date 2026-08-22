import type { CrmMetricsSource } from "./crmTypes.js";

export type CrmOrderSummary = {
  orderCount: number;
  ltv: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
};

export type EatzOrderSnapshot = {
  orderCount: number | null;
  totalSpent: number | null;
  avgTicket: number | null;
  lastOrderDate: string | null;
};

export type CrmEffectiveMetrics = CrmOrderSummary & {
  avgTicket: number;
  source: CrmMetricsSource;
};

/**
 * Resolve as métricas usadas pelo CRM sem somar fontes diferentes.
 * Pedidos CRM têm prioridade; o snapshot eatz só é fallback quando não existe
 * nenhum pedido concluído registado no CRM.
 */
export function resolveCrmMetrics(
  crm: CrmOrderSummary,
  eatz: EatzOrderSnapshot
): CrmEffectiveMetrics {
  if (crm.orderCount > 0) {
    return {
      ...crm,
      avgTicket: crm.ltv / crm.orderCount,
      source: "crm_orders",
    };
  }

  if (eatz.orderCount !== null) {
    const orderCount = eatz.orderCount;
    const ltv = eatz.totalSpent ?? 0;
    return {
      orderCount,
      ltv,
      avgTicket: eatz.avgTicket ?? (orderCount > 0 ? ltv / orderCount : 0),
      // O export não traz a primeira compra. Com exatamente um pedido, a data
      // do último pedido também é necessariamente a primeira.
      firstOrderDate: orderCount === 1 ? eatz.lastOrderDate : null,
      lastOrderDate: eatz.lastOrderDate,
      source: "eatz_snapshot",
    };
  }

  return {
    orderCount: 0,
    ltv: 0,
    avgTicket: 0,
    firstOrderDate: null,
    lastOrderDate: null,
    source: "none",
  };
}
