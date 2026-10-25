import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  SupplierItemPurchase,
  SupplierReplenishmentReadPort,
} from "../../domain/ports/out/supplier-replenishment-read.port.js";

// Faturas que não são compras confirmadas (mesma regra das estatísticas do fornecedor).
const EXCLUDED_STATUSES = new Set(["cancelled", "draft_ai", "pending_review"]);
// Saídas que contam como consumo (as transferências e ajustes não contam).
const CONSUMPTION_TYPES = ["consumption", "sale", "loss"];
// Um `in` com centenas de ids passaria o limite do URL do PostgREST.
const IN_CHUNK = 200;

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += IN_CHUNK) out.push(list.slice(i, i + IN_CHUNK));
  return out;
}

/**
 * Lê diretamente `invoices`/`invoice_lines`, `stock_movements` e
 * `stock_categories` via `ScopedQuery` — mesmo padrão dos outros adapters
 * de leitura deste módulo (tabelas partilhadas, sem port formal do módulo dono).
 */
export class SupplierReplenishmentReadAdapter implements SupplierReplenishmentReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async lastPurchasesBySupplier(organizationId: OrganizationId, supplierId: string): Promise<SupplierItemPurchase[]> {
    const inv = await this.scopedQuery(organizationId)
      .table("invoices")
      .select("id, invoice_date, status")
      .eq("supplier_id", supplierId)
      .eq("document_type", "invoice");
    if (inv.error) throw new Error(inv.error.message);

    const dates = new Map<string, string>();
    for (const row of (inv.data ?? []) as unknown as Array<{ id: string; invoice_date: string; status: string }>) {
      if (!EXCLUDED_STATUSES.has(row.status)) dates.set(row.id, row.invoice_date);
    }
    if (dates.size === 0) return [];

    const latest = new Map<string, SupplierItemPurchase>();
    for (const ids of chunks([...dates.keys()])) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("invoice_lines")
        .select("invoice_id, stock_item_id, unit_cost_without_vat, supplier_item_code, unit")
        .in("invoice_id", ids)
        .not("stock_item_id", "is", null);
      if (error) throw new Error(error.message);
      for (const l of (data ?? []) as unknown as Array<{
        invoice_id: string;
        stock_item_id: string;
        unit_cost_without_vat: number;
        supplier_item_code: string | null;
        unit: string | null;
      }>) {
        const date = dates.get(l.invoice_id)!;
        const current = latest.get(l.stock_item_id);
        if (current && current.lastPurchaseDate >= date) continue;
        latest.set(l.stock_item_id, {
          stockItemId: l.stock_item_id,
          lastPurchaseDate: date,
          // invoice_lines guarda cêntimos.
          lastUnitCostWithoutVat: Number(l.unit_cost_without_vat) / 100,
          supplierItemCode: l.supplier_item_code?.trim() || null,
          purchaseUnit: l.unit?.trim() || null,
        });
      }
    }
    return [...latest.values()];
  }

  async consumptionLastDays(organizationId: OrganizationId, stockItemIds: string[], days: number): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (stockItemIds.length === 0) return out;
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    for (const ids of chunks(stockItemIds)) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("stock_movements")
        .select("item_id, quantity")
        .in("item_id", ids)
        .in("type", CONSUMPTION_TYPES)
        .lt("quantity", 0)
        .gte("movement_date", since);
      if (error) throw new Error(error.message);
      for (const m of (data ?? []) as unknown as Array<{ item_id: string; quantity: number }>) {
        out.set(m.item_id, (out.get(m.item_id) ?? 0) - Number(m.quantity));
      }
    }
    return out;
  }

  async categoryNames(organizationId: OrganizationId, categoryIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const ids of chunks(categoryIds)) {
      const { data, error } = await this.scopedQuery(organizationId).table("stock_categories").select("id, name").in("id", ids);
      if (error) throw new Error(error.message);
      for (const c of (data ?? []) as unknown as Array<{ id: string; name: string }>) out.set(c.id, c.name);
    }
    return out;
  }
}
