import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { ProductMapping, ProductTargetType } from "../../domain/entities/food-cost.js";
import type { ProductMappingRepositoryPort } from "../../domain/ports/out/product-mapping-repository.port.js";

interface Row {
  product_key: string;
  product_code: string | null;
  product_description: string;
  target_type: ProductTargetType;
  pizza_id: string | null;
  size: string | null;
  stock_item_id: string | null;
}

/** Mapeamentos dos produtos do delivery (`delivery_product_mappings`, um por empresa e produto). */
export class SupabaseProductMappingRepository implements ProductMappingRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async list(organizationId: OrganizationId): Promise<ProductMapping[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("delivery_product_mappings")
      .select("product_key, product_code, product_description, target_type, pizza_id, size, stock_item_id");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      productKey: r.product_key,
      productCode: r.product_code,
      productDescription: r.product_description,
      targetType: r.target_type,
      pizzaId: r.pizza_id,
      size: r.size,
      stockItemId: r.stock_item_id,
    }));
  }

  async save(organizationId: OrganizationId, mappings: ProductMapping[], updatedBy: string | null): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("delivery_product_mappings")
      .upsert(
        mappings.map((m) => ({
          product_key: m.productKey,
          product_code: m.productCode,
          product_description: m.productDescription,
          target_type: m.targetType,
          pizza_id: m.pizzaId,
          size: m.size,
          stock_item_id: m.stockItemId,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "org_id,product_key" },
      );
    if (error) throw new Error(error.message);
  }

  async remove(organizationId: OrganizationId, productKeys: string[]): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("delivery_product_mappings").delete().in("product_key", productKeys);
    if (error) throw new Error(error.message);
  }
}
