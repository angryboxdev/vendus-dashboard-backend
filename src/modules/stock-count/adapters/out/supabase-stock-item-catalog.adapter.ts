import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  CreateStockItemForCountData,
  StockItemCatalogPort,
  StockItemForCountSnapshot,
  StockItemScopeFilter,
} from "../../domain/ports/out/stock-item-catalog.port.js";
import type { TolerancePolicy } from "../../domain/services/tolerance.service.js";

interface ItemRow {
  id: string;
  name: string;
  category_id: string;
  base_unit: string;
  is_active: boolean;
  stock_tracking_enabled: boolean;
  tolerance_absolute_qty: number | null;
  tolerance_percent: number | null;
  tolerance_financial_impact: number | null;
  purchase_reference_unit_cost_without_vat: number | null;
}

interface UnitRow {
  item_id: string;
  unit_label: string;
  conversion_factor_to_base: number;
}

const ITEM_SELECT =
  "id, name, category_id, base_unit, is_active, stock_tracking_enabled, tolerance_absolute_qty, tolerance_percent, tolerance_financial_impact, purchase_reference_unit_cost_without_vat";

function toTolerance(row: ItemRow): TolerancePolicy | null {
  const t: TolerancePolicy = {
    absoluteQty: row.tolerance_absolute_qty != null ? Number(row.tolerance_absolute_qty) : null,
    percent: row.tolerance_percent != null ? Number(row.tolerance_percent) : null,
    financialImpact: row.tolerance_financial_impact != null ? Number(row.tolerance_financial_impact) : null,
  };
  return t.absoluteQty != null || t.percent != null || t.financialImpact != null ? t : null;
}

/**
 * Lê/cria diretamente a tabela legacy `stock_items` (nunca via
 * `src/services/stockItemService.ts` — CLAUDE.md). Um item criado aqui
 * começa sempre com quantidade 0 implícita — nunca com um movimento
 * inicial.
 */
export class SupabaseStockItemCatalogAdapter implements StockItemCatalogPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  private async loadAlternateUnits(organizationId: OrganizationId, itemIds: string[]): Promise<Map<string, UnitRow[]>> {
    const byItem = new Map<string, UnitRow[]>();
    if (itemIds.length === 0) return byItem;
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_item_count_units")
      .select("item_id, unit_label, conversion_factor_to_base")
      .in("item_id", itemIds);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as UnitRow[]) {
      const list = byItem.get(row.item_id) ?? [];
      list.push(row);
      byItem.set(row.item_id, list);
    }
    return byItem;
  }

  private toSnapshot(row: ItemRow, units: UnitRow[]): StockItemForCountSnapshot {
    return {
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      baseUnit: row.base_unit,
      isActive: Boolean(row.is_active),
      stockTrackingEnabled: Boolean(row.stock_tracking_enabled),
      tolerance: toTolerance(row),
      purchaseReferenceUnitCostWithoutVat:
        row.purchase_reference_unit_cost_without_vat != null ? Number(row.purchase_reference_unit_cost_without_vat) : null,
      alternateUnits: units.map((u) => ({ unitLabel: u.unit_label, conversionFactorToBase: Number(u.conversion_factor_to_base) })),
    };
  }

  async listEligibleForScope(organizationId: OrganizationId, filter: StockItemScopeFilter): Promise<StockItemForCountSnapshot[]> {
    let q = this.scopedQuery(organizationId)
      .table("stock_items")
      .select(ITEM_SELECT)
      .eq("is_active", true)
      .eq("stock_tracking_enabled", true);
    if (filter.categoryIds && filter.categoryIds.length > 0 && filter.itemIds && filter.itemIds.length > 0) {
      q = q.or(`category_id.in.(${filter.categoryIds.join(",")}),id.in.(${filter.itemIds.join(",")})`);
    } else if (filter.categoryIds && filter.categoryIds.length > 0) {
      q = q.in("category_id", filter.categoryIds);
    } else if (filter.itemIds && filter.itemIds.length > 0) {
      q = q.in("id", filter.itemIds);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as ItemRow[];
    const unitsByItem = await this.loadAlternateUnits(organizationId, rows.map((r) => r.id));
    return rows.map((row) => this.toSnapshot(row, unitsByItem.get(row.id) ?? []));
  }

  async findById(organizationId: OrganizationId, id: string): Promise<StockItemForCountSnapshot | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_items").select(ITEM_SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as unknown as ItemRow;
    const unitsByItem = await this.loadAlternateUnits(organizationId, [row.id]);
    return this.toSnapshot(row, unitsByItem.get(row.id) ?? []);
  }

  async create(organizationId: OrganizationId, data: CreateStockItemForCountData): Promise<StockItemForCountSnapshot> {
    const row = {
      id: randomUUID(),
      name: data.name.trim(),
      category_id: data.categoryId,
      type: data.type,
      is_sellable: false,
      base_unit: data.baseUnit,
      min_stock: 0,
      is_active: true,
      stock_tracking_enabled: true,
      updated_at: new Date().toISOString(),
    };
    const { data: created, error } = await this.scopedQuery(organizationId).table("stock_items").insert(row).select(ITEM_SELECT).single();
    if (error) throw new Error(error.message);
    return this.toSnapshot(created as unknown as ItemRow, []);
  }
}
