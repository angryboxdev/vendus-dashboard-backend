import type { CrmParams, CrmSegment } from "./crmTypes.js";

/**
 * Calcula o segmento CRM de um cliente.
 *
 * Função pura — sem I/O, sem efeitos secundários.
 * Executa sempre do zero: não há "memória de segmento anterior".
 *
 * @param orderCount    Nº de pedidos concluídos
 * @param ltv           Valor total acumulado de pedidos concluídos (€)
 * @param daysSinceLast Dias desde o último pedido concluído (null = nunca pediu)
 * @param inactive      Se o cliente está marcado como Inativo Definitivo
 * @param params        Parâmetros de segmentação lidos da BD
 */
export function calculateSegment(
  orderCount: number,
  ltv: number,
  daysSinceLast: number | null,
  inactive: boolean,
  params: CrmParams
): CrmSegment {
  // SEG-07: nunca comprou
  if (orderCount === 0) return "SEG-07";

  // Inativo Definitivo: sai de toda comunicação
  if (inactive) return "INATIVO";

  // A partir daqui, daysSinceLast nunca é null (tem pelo menos 1 pedido)
  const days = daysSinceLast ?? 0;

  // SEG-06: Perdido (> 60 dias)
  if (days > params.seg05MaxDays) return "SEG-06";

  // SEG-05: Em Risco (31-60 dias)
  if (days > params.seg04MaxDays) return "SEG-05";

  // SEG-04: VIP (4+ pedidos OU LTV ≥ 100€, ≤ 45 dias)
  if ((orderCount >= params.vipMinOrders || ltv >= params.vipMinLtv) && days <= params.seg04MaxDays) {
    return "SEG-04";
  }

  // SEG-03: Recorrente (2-3 pedidos, ≤ 30 dias)
  if (orderCount >= 2 && days <= params.seg03MaxDays) return "SEG-03";

  // SEG-02: Em Ativação (1 pedido, 15-30 dias)
  if (orderCount === 1 && days > params.seg01MaxDays && days <= params.seg02MaxDays) {
    return "SEG-02";
  }

  // SEG-01: Novo (1 pedido, ≤ 14 dias)
  if (orderCount === 1 && days <= params.seg01MaxDays) return "SEG-01";

  // Fallback (ex: 2+ pedidos mas > 30 dias — transita para Em Risco)
  return "SEG-05";
}
