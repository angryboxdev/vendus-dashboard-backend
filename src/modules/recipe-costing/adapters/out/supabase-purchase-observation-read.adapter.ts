import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { PurchaseObservation } from "../../domain/entities/price-history.js";
import type { PurchaseObservationReadPort } from "../../domain/ports/out/purchase-observation-read.port.js";

interface LineRow {
  id: string;
  review_id: string;
  stock_item_id: string;
  stock_quantity: number | null;
  purchase_quantity: number;
  unit_cost_without_vat: number;
  total_with_vat: number;
  vat_amount: number | null;
  unit_cost_per_base_unit_without_vat: number | null;
}
interface ReviewRow { id: string; supplier_name: string; decision_supplier_id: string | null; invoice_number: string; invoice_date: string }

const LINE_COLS = "id, review_id, stock_item_id, stock_quantity, purchase_quantity, unit_cost_without_vat, total_with_vat, vat_amount, unit_cost_per_base_unit_without_vat";
const REVIEW_COLS = "id, supplier_name, decision_supplier_id, invoice_number, invoice_date";
const PAGE = 1000;

/**
 * Lê as linhas de compra confirmadas para o Stock (`stock_review_lines` de revisões `applied`): a
 * mesma fonte dos movimentos de compra, mas com o bruto, o IVA e o desconto da linha. Não lê
 * movimentos manuais nem o importador antigo (custos noutra unidade) — só compras validadas.
 */
export class SupabasePurchaseObservationReadAdapter implements PurchaseObservationReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findItem(organizationId: OrganizationId, stockItemId: string): Promise<{ id: string; name: string; baseUnit: string } | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_items").select("id, name, base_unit").eq("id", stockItemId).maybeSingle();
    if (error) throw new Error(`Histórico de preços: ${error.message}`);
    const row = data as unknown as { id: string; name: string; base_unit: string } | null;
    return row ? { id: row.id, name: row.name, baseUnit: row.base_unit } : null;
  }

  async listForItem(organizationId: OrganizationId, stockItemId: string): Promise<PurchaseObservation[]> {
    const db = this.scopedQuery(organizationId);
    const lines = await db.table("stock_review_lines").select(LINE_COLS).eq("stock_item_id", stockItemId).in("resolution_type", ["existing_item", "new_item"]);
    if (lines.error) throw new Error(`Histórico de preços: ${lines.error.message}`);
    const lineRows = (lines.data ?? []) as unknown as LineRow[];
    if (lineRows.length === 0) return [];
    const reviews = await db.table("stock_purchase_reviews").select(REVIEW_COLS).in("id", [...new Set(lineRows.map((l) => l.review_id))]).eq("status", "applied");
    if (reviews.error) throw new Error(`Histórico de preços: ${reviews.error.message}`);
    const byId = new Map(((reviews.data ?? []) as unknown as ReviewRow[]).map((r) => [r.id, r]));
    return lineRows.flatMap((l) => toObservation(l, byId.get(l.review_id)));
  }

  /** Todas as compras confirmadas da empresa, por artigo (uma leitura paginada, sem N+1). */
  async listAll(organizationId: OrganizationId): Promise<Map<string, PurchaseObservation[]>> {
    const db = this.scopedQuery(organizationId);
    const reviews = await paged<ReviewRow>((from, to) => db.table("stock_purchase_reviews").select(REVIEW_COLS).eq("status", "applied").order("id").range(from, to));
    const byId = new Map(reviews.map((r) => [r.id, r]));
    const lines = await paged<LineRow>((from, to) =>
      db.table("stock_review_lines").select(LINE_COLS).in("resolution_type", ["existing_item", "new_item"]).not("stock_item_id", "is", null).order("id").range(from, to),
    );
    const out = new Map<string, PurchaseObservation[]>();
    for (const l of lines) {
      for (const o of toObservation(l, byId.get(l.review_id))) out.set(l.stock_item_id, [...(out.get(l.stock_item_id) ?? []), o]);
    }
    return out;
  }
}

async function paged<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`Compras confirmadas: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function toObservation(l: LineRow, review: ReviewRow | undefined): PurchaseObservation[] {
  const quantity = Number(l.stock_quantity ?? 0);
  if (!review || !(quantity > 0)) return [];
  const vat = l.vat_amount == null ? null : Number(l.vat_amount);
  const net = vat !== null ? Number(l.total_with_vat) - vat : Number(l.unit_cost_per_base_unit_without_vat ?? 0) * quantity;
  const gross = Math.round(Number(l.purchase_quantity) * Number(l.unit_cost_without_vat));
  return [{
    lineId: l.id,
    reviewId: review.id,
    supplierId: review.decision_supplier_id,
    supplierName: review.supplier_name,
    invoiceNumber: review.invoice_number,
    invoiceDate: String(review.invoice_date).slice(0, 10),
    quantity,
    grossCents: vat !== null ? gross : null,
    discountCents: vat !== null ? Math.max(0, gross - net) : null,
    netCents: net,
  }];
}
