import type { VendusDetailedDocument } from "../../entities/vendus-document.js";
import type { VendusAnalytics } from "../../entities/vendus-analytics.js";

export interface SummaryParams {
  since: string;
  until: string;
}

export interface VendusSummaryResult {
  documents: VendusDetailedDocument[];
  analytics: VendusAnalytics;
}

/**
 * Use case principal do módulo Vendus — análogo ao GetSummaryPort do air-menu.
 *
 * Devolve documentos detalhados (com channel derivado) + analytics completos
 * (byChannel, byCategory, byVatRate, topProducts, temporalDistribution).
 *
 * Exposto via composition root para ser injetado noutros módulos
 * (ex: cash-closings) sem duplicar lógica de fetch.
 */
export interface GetSummaryPort {
  execute(params: SummaryParams): Promise<VendusSummaryResult>;
}
