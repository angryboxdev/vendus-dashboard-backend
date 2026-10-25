import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  LearnedMappingSuggestion,
  LearnMappingData,
  StockReviewLearnedMappingPort,
} from "../../domain/ports/out/stock-review-learned-mapping.port.js";

export class FakeStockReviewLearnedMapping implements StockReviewLearnedMappingPort {
  learned: LearnMappingData[] = [];
  activeItemIds = new Set<string>();

  async suggest(
    _organizationId: OrganizationId,
    supplierId: string,
    supplierReference: string | null,
    normalizedDescription: string,
  ): Promise<LearnedMappingSuggestion | null> {
    // Como o upsert real: a decisão mais recente para a mesma chave é a que vale.
    const latest = [...this.learned].reverse();
    const byReference = supplierReference
      ? latest.find((m) => m.supplierId === supplierId && m.supplierReference === supplierReference)
      : undefined;
    const match = byReference ?? latest.find((m) => m.supplierId === supplierId && m.normalizedDescription === normalizedDescription);
    if (!match) return null;
    return {
      resolutionType: match.resolutionType,
      stockItemId: match.stockItemId ?? null,
      conversionFactor: match.conversionFactor ?? null,
      purchaseUnit: match.purchaseUnit ?? null,
      isItemActive: match.stockItemId ? this.activeItemIds.has(match.stockItemId) : true,
    };
  }

  async suggestByReference(organizationId: OrganizationId, supplierReference: string): Promise<LearnedMappingSuggestion | null> {
    const m = [...this.learned].reverse().find((x) => x.supplierReference === supplierReference && x.resolutionType === "existing_item");
    return m ? this.suggest(organizationId, m.supplierId, supplierReference, m.normalizedDescription) : null;
  }

  async learn(_organizationId: OrganizationId, data: LearnMappingData): Promise<void> {
    this.learned.push(data);
    if (data.stockItemId) this.activeItemIds.add(data.stockItemId);
  }
}
