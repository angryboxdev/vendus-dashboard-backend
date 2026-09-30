import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface LearnedMappingSuggestion {
  resolutionType: "existing_item" | "no_stock_effect";
  stockItemId: string | null;
  conversionFactor: number | null;
  purchaseUnit: string | null;
  /** `false` quando o item aprendido entretanto ficou inativo/inexistente — nunca aplicar automaticamente, só sinalizar. */
  isItemActive: boolean;
}

export interface LearnMappingData {
  supplierId: string;
  supplierReference: string | null;
  normalizedDescription: string;
  resolutionType: "existing_item" | "no_stock_effect";
  stockItemId?: string | null;
  conversionFactor?: number | null;
  purchaseUnit?: string | null;
}

/**
 * Procura por referência primeiro, descrição normalizada como fallback
 * (secção 27 da task). Nunca cria item novo sozinho — só sugestão.
 */
export interface StockReviewLearnedMappingPort {
  suggest(
    organizationId: OrganizationId,
    supplierId: string,
    supplierReference: string | null,
    normalizedDescription: string,
  ): Promise<LearnedMappingSuggestion | null>;
  learn(organizationId: OrganizationId, data: LearnMappingData): Promise<void>;
}
