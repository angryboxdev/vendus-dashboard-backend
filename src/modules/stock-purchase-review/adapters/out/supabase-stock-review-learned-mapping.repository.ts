import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  LearnedMappingSuggestion,
  LearnMappingData,
  StockReviewLearnedMappingPort,
} from "../../domain/ports/out/stock-review-learned-mapping.port.js";

/** Procura por referência primeiro, descrição normalizada como fallback (secção 27 da task). */
export class SupabaseStockReviewLearnedMappingRepository implements StockReviewLearnedMappingPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async suggest(
    organizationId: OrganizationId,
    supplierId: string,
    supplierReference: string | null,
    normalizedDescription: string,
  ): Promise<LearnedMappingSuggestion | null> {
    if (supplierReference) {
      const byReference = await this.findOne(organizationId, supplierId, "supplier_reference", supplierReference);
      if (byReference) return this.toSuggestion(organizationId, byReference);
    }
    const byDescription = await this.findOne(organizationId, supplierId, "normalized_description", normalizedDescription);
    return byDescription ? this.toSuggestion(organizationId, byDescription) : null;
  }

  private async findOne(
    organizationId: OrganizationId,
    supplierId: string,
    column: string,
    value: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_review_learned_mappings")
      .select("*")
      .eq("supplier_id", supplierId)
      .eq(column, value)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as Record<string, unknown> | null) ?? null;
  }

  private async toSuggestion(organizationId: OrganizationId, row: Record<string, unknown>): Promise<LearnedMappingSuggestion> {
    const resolutionType = row.resolution_type as "existing_item" | "no_stock_effect";
    const stockItemId = (row.stock_item_id as string | null) ?? null;
    let isItemActive = true;
    if (resolutionType === "existing_item" && stockItemId) {
      const { data } = await this.scopedQuery(organizationId).table("stock_items").select("is_active").eq("id", stockItemId).maybeSingle();
      isItemActive = data ? Boolean((data as unknown as { is_active: boolean }).is_active) : false;
    }
    return {
      resolutionType,
      stockItemId,
      conversionFactor: row.conversion_factor != null ? Number(row.conversion_factor) : null,
      purchaseUnit: (row.purchase_unit as string | null) ?? null,
      isItemActive,
    };
  }

  async learn(organizationId: OrganizationId, data: LearnMappingData): Promise<void> {
    const row = {
      id: randomUUID(),
      supplier_id: data.supplierId,
      supplier_reference: data.supplierReference,
      normalized_description: data.normalizedDescription,
      resolution_type: data.resolutionType,
      stock_item_id: data.stockItemId ?? null,
      conversion_factor: data.conversionFactor ?? null,
      purchase_unit: data.purchaseUnit ?? null,
      last_used_at: new Date().toISOString(),
    };
    const onConflict = data.supplierReference ? "supplier_id,supplier_reference" : "supplier_id,normalized_description";
    const { error } = await this.scopedQuery(organizationId)
      .table("stock_review_learned_mappings")
      .upsert(row, { onConflict });
    if (error) throw new Error(error.message);
  }
}
