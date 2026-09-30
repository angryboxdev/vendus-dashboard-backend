import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { LearnedMappingReadPort, LearnedPackagingSnapshot } from "../../domain/ports/out/learned-mapping-read.port.js";

interface Row {
  supplier_id: string;
  stock_item_id: string;
  conversion_factor: number | null;
  purchase_unit: string | null;
  last_used_at: string | null;
}

function toSnapshot(row: Row): LearnedPackagingSnapshot | null {
  if (row.conversion_factor == null || !row.purchase_unit) return null;
  return {
    supplierId: row.supplier_id,
    stockItemId: row.stock_item_id,
    conversionFactor: Number(row.conversion_factor),
    purchaseUnit: row.purchase_unit,
  };
}

/**
 * Lê `stock_review_learned_mappings` (tabela do módulo
 * `stock-purchase-review`) diretamente por `ScopedQuery` — ver
 * `domain/ports/out/learned-mapping-read.port.ts` para o porquê de não
 * passar por um port exportado desse módulo.
 */
export class LearnedMappingReadAdapter implements LearnedMappingReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findPackaging(organizationId: OrganizationId, supplierId: string, stockItemId: string): Promise<LearnedPackagingSnapshot | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_review_learned_mappings")
      .select("supplier_id, stock_item_id, conversion_factor, purchase_unit, last_used_at")
      .eq("supplier_id", supplierId)
      .eq("stock_item_id", stockItemId)
      .eq("resolution_type", "existing_item")
      .order("last_used_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toSnapshot(data as unknown as Row) : null;
  }

  async findAllForItem(organizationId: OrganizationId, stockItemId: string): Promise<LearnedPackagingSnapshot[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_review_learned_mappings")
      .select("supplier_id, stock_item_id, conversion_factor, purchase_unit, last_used_at")
      .eq("stock_item_id", stockItemId)
      .eq("resolution_type", "existing_item");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Row[];
    const snapshots: LearnedPackagingSnapshot[] = [];
    for (const row of rows) {
      const snapshot = toSnapshot(row);
      if (snapshot) snapshots.push(snapshot);
    }
    return snapshots;
  }
}
