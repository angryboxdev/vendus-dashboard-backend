import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { NewPosProduct, PosProduct, PosSaleRecord, PosSettings, PosView, StockMove } from "../../domain/entities/pos.js";
import { PosNotFoundError, PosRuleError } from "../../domain/errors.js";
import type { PosStorePort } from "../../domain/ports/out/pos.ports.js";

const PRODUCT_COLS = "id, ref, name, category, price_cents, vat_rate, product_type, track_stock, stock_qty, barcode, image_url, active";
const MOVE_COLS = "id, product_id, kind, qty, stock_before, stock_after, sale_id, document_number, actor_name, note, created_at";
const SALE_COLS =
  "id, kind, document_id, document_number, employee_id, employee_name, payment_method, total_cents, given_cents, change_cents, refund_of, reason, lines, created_at";

type ProductRow = {
  id: string;
  ref: string;
  name: string;
  category: string | null;
  price_cents: number;
  vat_rate: number;
  product_type: "P" | "S";
  track_stock: boolean;
  stock_qty: number;
  barcode: string | null;
  image_url: string | null;
  active: boolean;
};

const toProduct = (r: ProductRow): PosProduct => ({
  id: r.id,
  ref: r.ref,
  name: r.name,
  category: r.category,
  priceCents: r.price_cents,
  vatRate: r.vat_rate as PosProduct["vatRate"],
  productType: r.product_type,
  trackStock: r.track_stock,
  stockQty: r.stock_qty,
  barcode: r.barcode,
  imageUrl: r.image_url,
  active: r.active,
});

const toSale = (r: Record<string, unknown>): PosSaleRecord => ({
  id: r.id as string,
  kind: r.kind as PosSaleRecord["kind"],
  documentId: r.document_id as string,
  documentNumber: r.document_number as string,
  employeeId: r.employee_id as string,
  employeeName: r.employee_name as string,
  paymentMethod: r.payment_method as PosSaleRecord["paymentMethod"],
  totalCents: r.total_cents as number,
  givenCents: (r.given_cents as number | null) ?? null,
  changeCents: (r.change_cents as number | null) ?? null,
  refundOf: (r.refund_of as string | null) ?? null,
  reason: (r.reason as string | null) ?? null,
  lines: r.lines as PosSaleRecord["lines"],
  createdAt: r.created_at as string,
});

const toMove = (r: Record<string, unknown>): StockMove => ({
  id: r.id as string,
  productId: r.product_id as string,
  kind: r.kind as StockMove["kind"],
  qty: r.qty as number,
  stockBefore: r.stock_before as number,
  stockAfter: r.stock_after as number,
  saleId: (r.sale_id as string | null) ?? null,
  documentNumber: (r.document_number as string | null) ?? null,
  actorName: (r.actor_name as string | null) ?? null,
  note: (r.note as string | null) ?? null,
  createdAt: r.created_at as string,
});

const PAGE = 1000;
const UNIQUE_VIOLATION = "23505";

/**
 * Produtos, configuração, vendas e stock do POS (`20261221100000_pos_phase1.sql`,
 * `20261221110000_pos_phase2.sql`). O contador `stock_qty` só muda por movimentos
 * (trigger); a venda registada gera os seus movimentos na mesma transação.
 */
export class SupabasePosStore implements PosStorePort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async listProducts(org: OrganizationId, opts: { activeOnly?: boolean } = {}): Promise<PosProduct[]> {
    let q = this.scoped(org).table("pos_products").select(PRODUCT_COLS);
    if (opts.activeOnly) q = q.eq("active", true);
    const { data, error } = await q.order("category", { ascending: true, nullsFirst: false }).order("name", { ascending: true }).range(0, PAGE - 1);
    if (error) throw new Error(`POS: erro a ler os produtos: ${error.message}`);
    return ((data ?? []) as unknown as ProductRow[]).map(toProduct);
  }

  async productsByIds(org: OrganizationId, ids: string[]): Promise<PosProduct[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.scoped(org).table("pos_products").select(PRODUCT_COLS).in("id", ids);
    if (error) throw new PosRuleError("Produto inválido");
    return ((data ?? []) as unknown as ProductRow[]).map(toProduct);
  }

  async upsertProducts(org: OrganizationId, products: NewPosProduct[]) {
    const existing = new Set((await this.listProducts(org)).map((p) => p.ref));
    const now = new Date().toISOString();
    const rows = products.map((p) => ({
      ref: p.ref,
      name: p.name,
      category: p.category,
      price_cents: p.priceCents,
      vat_rate: p.vatRate,
      product_type: p.productType,
      track_stock: p.trackStock,
      image_url: p.imageUrl,
      active: true,
      updated_at: now,
    }));
    // Sem código de barras no ficheiro não se apaga o que foi lido na gestão: essas linhas vão sem a coluna.
    const withCode = rows.flatMap((r, i) => (products[i]!.barcode ? [{ ...r, barcode: products[i]!.barcode }] : []));
    const withoutCode = rows.filter((_r, i) => !products[i]!.barcode);
    for (const batch of [withoutCode, withCode]) {
      if (batch.length === 0) continue;
      const { error } = await this.scoped(org).table("pos_products").upsert(batch, { onConflict: "org_id,ref" });
      if (error?.code === UNIQUE_VIOLATION) throw new PosRuleError("Um código de barras do ficheiro já está noutro produto");
      if (error) throw new Error(`POS: erro a gravar os produtos: ${error.message}`);
    }
    const updated = products.filter((p) => existing.has(p.ref)).length;
    return { created: products.length - updated, updated };
  }

  async deactivateProductsExcept(org: OrganizationId, refs: string[]) {
    const keep = new Set(refs);
    const ids = (await this.listProducts(org, { activeOnly: true })).filter((p) => !keep.has(p.ref)).map((p) => p.id);
    if (ids.length === 0) return 0;
    const { error } = await this.scoped(org).table("pos_products").update({ active: false, updated_at: new Date().toISOString() }).in("id", ids);
    if (error) throw new Error(`POS: erro a tirar produtos da venda: ${error.message}`);
    return ids.length;
  }

  async updateProduct(org: OrganizationId, id: string, patch: Partial<Omit<PosProduct, "id" | "ref">>): Promise<PosProduct> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.priceCents !== undefined) row.price_cents = patch.priceCents;
    if (patch.vatRate !== undefined) row.vat_rate = patch.vatRate;
    if (patch.active !== undefined) row.active = patch.active;
    if (patch.trackStock !== undefined) row.track_stock = patch.trackStock;
    if (patch.barcode !== undefined) row.barcode = patch.barcode;
    const { data, error } = await this.scoped(org).table("pos_products").update(row).eq("id", id).select(PRODUCT_COLS).maybeSingle();
    if (error?.code === UNIQUE_VIOLATION) throw new PosRuleError("Este código de barras já está noutro produto");
    if (error) throw new PosRuleError(error.code === "22P02" ? "Identificador inválido" : "Dados do produto inválidos");
    if (!data) throw new PosNotFoundError("Produto");
    return toProduct(data as unknown as ProductRow);
  }

  async getSettings(org: OrganizationId): Promise<PosSettings> {
    const { data, error } = await this.scoped(org).table("pos_settings").select("invoice_series_ref, credit_series_ref, manager_employee_ids, default_view").maybeSingle();
    if (error) throw new Error(`POS: erro a ler a configuração: ${error.message}`);
    const r = (data ?? {}) as { invoice_series_ref?: string | null; credit_series_ref?: string | null; manager_employee_ids?: string[] | null; default_view?: PosView | null };
    return {
      invoiceSeriesRef: r.invoice_series_ref ?? null,
      creditSeriesRef: r.credit_series_ref ?? null,
      managerEmployeeIds: r.manager_employee_ids ?? [],
      defaultView: r.default_view ?? "A",
    };
  }

  async saveSettings(org: OrganizationId, s: PosSettings): Promise<void> {
    const { error } = await this.scoped(org)
      .table("pos_settings")
      .upsert(
        {
          invoice_series_ref: s.invoiceSeriesRef,
          credit_series_ref: s.creditSeriesRef,
          manager_employee_ids: s.managerEmployeeIds,
          default_view: s.defaultView,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" },
      );
    if (error) throw new PosRuleError("Configuração inválida");
  }

  async getEmployeeView(org: OrganizationId, employeeId: string): Promise<PosView | null> {
    const { data, error } = await this.scoped(org).table("pos_employee_prefs").select("view").eq("employee_id", employeeId).maybeSingle();
    if (error) throw new Error(`POS: erro a ler a vista do funcionário: ${error.message}`);
    return (data as { view?: PosView } | null)?.view ?? null;
  }

  async setEmployeeView(org: OrganizationId, employeeId: string, view: PosView): Promise<void> {
    const { error } = await this.scoped(org)
      .table("pos_employee_prefs")
      .upsert({ employee_id: employeeId, view, updated_at: new Date().toISOString() }, { onConflict: "org_id,employee_id" });
    if (error) throw new Error(`POS: erro a gravar a vista do funcionário: ${error.message}`);
  }

  async recordSale(org: OrganizationId, r: Omit<PosSaleRecord, "id" | "createdAt">): Promise<PosSaleRecord> {
    const { data, error } = await this.scoped(org)
      .table("pos_sales")
      .insert({
        kind: r.kind,
        document_id: r.documentId,
        document_number: r.documentNumber,
        employee_id: r.employeeId,
        employee_name: r.employeeName,
        payment_method: r.paymentMethod,
        total_cents: r.totalCents,
        given_cents: r.givenCents,
        change_cents: r.changeCents,
        refund_of: r.refundOf,
        reason: r.reason,
        lines: r.lines,
      })
      .select(SALE_COLS)
      .single();
    if (error) throw new Error(`POS: erro a registar a venda (documento ${r.documentNumber} emitido): ${error.message}`);
    return toSale(data as unknown as Record<string, unknown>);
  }

  async getSale(org: OrganizationId, id: string): Promise<PosSaleRecord | null> {
    const { data, error } = await this.scoped(org).table("pos_sales").select(SALE_COLS).eq("id", id).maybeSingle();
    if (error) throw new PosRuleError("Identificador inválido");
    return data ? toSale(data as unknown as Record<string, unknown>) : null;
  }

  async salesBetween(org: OrganizationId, fromIso: string, toIso: string): Promise<PosSaleRecord[]> {
    const out: PosSaleRecord[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.scoped(org)
        .table("pos_sales")
        .select(SALE_COLS)
        .gte("created_at", fromIso)
        .lt("created_at", toIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`POS: erro a ler as vendas: ${error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      out.push(...rows.map(toSale));
      if (rows.length < PAGE) return out;
    }
  }

  async refundsOf(org: OrganizationId, saleId: string): Promise<PosSaleRecord[]> {
    const { data, error } = await this.scoped(org).table("pos_sales").select(SALE_COLS).eq("refund_of", saleId);
    if (error) throw new Error(`POS: erro a ler as devoluções: ${error.message}`);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toSale);
  }

  async recordStockMove(
    org: OrganizationId,
    m: { productId: string; actorName: string; note: string | null } & ({ kind: "entry"; qty: number } | { kind: "count"; countTo: number }),
  ): Promise<StockMove> {
    const row =
      m.kind === "entry"
        ? { product_id: m.productId, kind: "entry", qty: m.qty, actor_name: m.actorName, note: m.note }
        : { product_id: m.productId, kind: "count", qty: 0, count_to: m.countTo, actor_name: m.actorName, note: m.note };
    const { data, error } = await this.scoped(org).table("pos_stock_moves").insert(row).select(MOVE_COLS).single();
    if (error) throw new Error(`POS: erro a registar o movimento de stock: ${error.message}`);
    return toMove(data as unknown as Record<string, unknown>);
  }

  async stockMovesBetween(org: OrganizationId, fromIso: string, toIso: string): Promise<StockMove[]> {
    const out: StockMove[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.scoped(org)
        .table("pos_stock_moves")
        .select(MOVE_COLS)
        .gte("created_at", fromIso)
        .lt("created_at", toIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`POS: erro a ler os movimentos de stock: ${error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      out.push(...rows.map(toMove));
      if (rows.length < PAGE) return out;
    }
  }
}
