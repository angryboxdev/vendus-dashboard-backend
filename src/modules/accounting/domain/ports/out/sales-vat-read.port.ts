import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** DTO próprio do módulo (nunca o DTO do `vendus` diretamente) — valores sempre em cêntimos, ao contrário do `vendus`, que devolve euros (ver adapter). */
export interface SalesVatRateStatsDTO {
  rate: number;
  grossRevenue: number;
  vatAmount: number;
  netRevenue: number;
}

/**
 * Porta fina sobre o `GetSummaryPort` do módulo `vendus` (D10) — implementada
 * por `VendusSalesVatReadAdapter`, que também converte euros → cêntimos.
 * Nunca recalcula o IVA de vendas; só lê o que o `vendus` já calcula.
 */
export interface SalesVatReadPort {
  getVatByRate(organizationId: OrganizationId, from: string, to: string): Promise<SalesVatRateStatsDTO[]>;
}
