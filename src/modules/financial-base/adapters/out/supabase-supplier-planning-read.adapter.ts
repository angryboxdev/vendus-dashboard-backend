import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { SupplierPlanningReadModel, SupplierPlanningReadPort } from "../../domain/ports/out/supplier-planning-read.port.js";

// Mesmos critérios das estatísticas do fornecedor (faturas lançadas, sem rascunhos nem anuladas).
const EXCLUDED_STATUSES = ["cancelled", "draft_ai", "pending_review"];
// Compras por rever que nunca darão entrada no stock.
const EXCLUDED_REVIEW_STATUSES = new Set(["cancelled", "excluded"]);
const IN_CHUNK = 200;

/**
 * Leitura direta de `invoices`/`invoice_lines`/`cost_center_categories` e das Compras por rever
 * (`stock_purchase_reviews`/`stock_review_lines`/`stock_items`) — só leitura, como
 * `SupabaseSupplierInvoiceStatsAdapter`. Lotes de ids para não passar o limite do URL do PostgREST.
 */
export class SupabaseSupplierPlanningReadAdapter implements SupplierPlanningReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async read(organizationId: OrganizationId, supplierId: string, since: string): Promise<SupplierPlanningReadModel> {
    const db = () => this.scopedQuery(organizationId);

    const inv = await db()
      .table("invoices")
      .select("id, invoice_date, subtotal_without_vat, status")
      .eq("supplier_id", supplierId)
      .eq("document_type", "invoice")
      .gte("invoice_date", since);
    if (inv.error) throw new Error(inv.error.message);
    const invoices = ((inv.data ?? []) as unknown as Array<{ id: string; invoice_date: string; subtotal_without_vat: number; status: string }>)
      .filter((r) => !EXCLUDED_STATUSES.includes(r.status))
      .map((r) => ({ id: r.id, date: r.invoice_date.slice(0, 10), netCents: Number(r.subtotal_without_vat) || 0 }));
    if (invoices.length === 0) return { invoices, lines: [], stockPurchases: [] };
    const invoiceIds = invoices.map((i) => i.id);
    const dateByInvoice = new Map(invoices.map((i) => [i.id, i.date]));

    const lineRows = await this.chunked(invoiceIds, async (ids) => {
      const r = await db().table("invoice_lines").select("cost_center_category_id, total_with_vat, vat_amount").in("invoice_id", ids);
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as unknown as Array<{ cost_center_category_id: string | null; total_with_vat: number; vat_amount: number }>;
    });
    const categoryIds = [...new Set(lineRows.map((l) => l.cost_center_category_id).filter((id): id is string => !!id))];
    const categoryNames = new Map<string, string>();
    for (const rows of await this.chunked(categoryIds, async (ids) => {
      const r = await db().table("cost_center_categories").select("id, name").in("id", ids);
      if (r.error) throw new Error(r.error.message);
      return [(r.data ?? []) as unknown as Array<{ id: string; name: string }>];
    })) for (const c of rows) categoryNames.set(c.id, c.name);
    const lines = lineRows.map((l) => ({
      categoryId: l.cost_center_category_id,
      categoryName: l.cost_center_category_id ? categoryNames.get(l.cost_center_category_id) ?? null : null,
      netCents: (Number(l.total_with_vat) || 0) - (Number(l.vat_amount) || 0),
    }));

    const reviews = (await this.chunked(invoiceIds, async (ids) => {
      const r = await db().table("stock_purchase_reviews").select("id, invoice_id, status").in("invoice_id", ids);
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as unknown as Array<{ id: string; invoice_id: string; status: string }>;
    })).filter((r) => !EXCLUDED_REVIEW_STATUSES.has(r.status));
    const dateByReview = new Map(reviews.map((r) => [r.id, dateByInvoice.get(r.invoice_id)!]));

    const reviewLines = await this.chunked(reviews.map((r) => r.id), async (ids) => {
      const r = await db()
        .table("stock_review_lines")
        .select("review_id, stock_item_id, unit_cost_per_base_unit_without_vat")
        .in("review_id", ids)
        .in("resolution_type", ["existing_item", "new_item"])
        .not("unit_cost_per_base_unit_without_vat", "is", null);
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as unknown as Array<{ review_id: string; stock_item_id: string; unit_cost_per_base_unit_without_vat: number }>;
    });
    const itemIds = [...new Set(reviewLines.map((l) => l.stock_item_id))];
    const items = new Map<string, { name: string; base_unit: string }>();
    for (const rows of await this.chunked(itemIds, async (ids) => {
      const r = await db().table("stock_items").select("id, name, base_unit").in("id", ids);
      if (r.error) throw new Error(r.error.message);
      return [(r.data ?? []) as unknown as Array<{ id: string; name: string; base_unit: string }>];
    })) for (const it of rows) items.set(it.id, it);

    const stockPurchases = reviewLines
      .filter((l) => items.has(l.stock_item_id))
      .map((l) => ({
        stockItemId: l.stock_item_id,
        itemName: items.get(l.stock_item_id)!.name,
        baseUnit: items.get(l.stock_item_id)!.base_unit,
        date: dateByReview.get(l.review_id)!,
        unitCostPerBaseUnitCents: Number(l.unit_cost_per_base_unit_without_vat),
      }));

    return { invoices, lines, stockPurchases };
  }

  private async chunked<T>(ids: string[], run: (ids: string[]) => Promise<T[]>): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += IN_CHUNK) out.push(...(await run(ids.slice(i, i + IN_CHUNK))));
    return out;
  }
}
