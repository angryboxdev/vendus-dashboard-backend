import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { CreateStockItemData, StockCatalogWritePort, StockItemSnapshot } from "../../domain/ports/out/stock-catalog-write.port.js";

/**
 * Escreve diretamente na tabela legacy `stock_items` (nunca através de
 * `src/services/stockItemService.ts` — CLAUDE.md: nunca imitar/estender um
 * módulo legacy). Um item criado aqui começa sempre sem nenhum movimento —
 * a quantidade só entra quando a revisão é confirmada.
 */
export class SupabaseStockCatalogWriteAdapter implements StockCatalogWritePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async create(organizationId: OrganizationId, data: CreateStockItemData): Promise<StockItemSnapshot> {
    const row = {
      id: randomUUID(),
      name: data.name.trim(),
      category_id: data.categoryId,
      type: data.type,
      is_sellable: false,
      base_unit: data.baseUnit,
      min_stock: 0,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    const { data: created, error } = await this.scopedQuery(organizationId)
      .table("stock_items")
      .insert(row)
      .select("id, name, base_unit, is_active")
      .single();
    if (error) throw new Error(error.message);
    const r = created as unknown as { id: string; name: string; base_unit: string; is_active: boolean };
    return { id: r.id, name: r.name, baseUnit: r.base_unit, isActive: Boolean(r.is_active) };
  }

  async findById(organizationId: OrganizationId, id: string): Promise<StockItemSnapshot | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_items")
      .select("id, name, base_unit, is_active")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const r = data as unknown as { id: string; name: string; base_unit: string; is_active: boolean };
    return { id: r.id, name: r.name, baseUnit: r.base_unit, isActive: Boolean(r.is_active) };
  }
}
