import type { SupabaseClient } from "@supabase/supabase-js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type { InvoiceLineType } from "../../domain/entities/invoice.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";

function toEntity(row: Record<string, unknown>): InvoiceLine {
  return InvoiceLine.reconstitute({
    id: row.id as string,
    invoiceId: row.invoice_id as string,
    description: row.description as string,
    type: row.type as InvoiceLineType,
    costCenterId: (row.cost_center_id as string | null) ?? null,
    costCenterCategoryId: (row.cost_center_category_id as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    stockItemId: (row.stock_item_id as string | null) ?? null,
    quantity: row.quantity as number,
    unit: (row.unit as string | null) ?? null,
    unitCostWithoutVat: row.unit_cost_without_vat as number,
    vatRate: row.vat_rate as number,
    vatAmount: row.vat_amount as number,
    totalWithVat: row.total_with_vat as number,
    stockEntryId: (row.stock_entry_id as string | null) ?? null,
    affectsDre: (row.affects_dre as boolean | null) ?? true,
    affectsCashflow: (row.affects_cashflow as boolean | null) ?? true,
    affectsProfitability: (row.affects_profitability as boolean | null) ?? false,
    createdAt: new Date(row.created_at as string),
  });
}

export class SupabaseInvoiceLineRepository implements InvoiceLineRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async saveAll(lines: InvoiceLine[]): Promise<void> {
    if (lines.length === 0) return;
    const rows = lines.map((l) => ({
      id: l.id,
      invoice_id: l.invoiceId,
      description: l.description,
      type: l.type,
      cost_center_id: l.costCenterId,
      cost_center_category_id: l.costCenterCategoryId,
      category: l.category,
      subcategory: l.subcategory,
      stock_item_id: l.stockItemId,
      quantity: l.quantity,
      unit: l.unit,
      unit_cost_without_vat: l.unitCostWithoutVat,
      vat_rate: l.vatRate,
      vat_amount: l.vatAmount,
      total_with_vat: l.totalWithVat,
      stock_entry_id: l.stockEntryId,
      affects_dre: l.affectsDre,
      affects_cashflow: l.affectsCashflow,
      affects_profitability: l.affectsProfitability,
      created_at: l.createdAt.toISOString(),
    }));
    const { error } = await this.supabase.from("invoice_lines").insert(rows);
    if (error) throw new Error(error.message);
  }

  async findAll(): Promise<InvoiceLine[]> {
    const { data, error } = await this.supabase
      .from("invoice_lines")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }

  async findByInvoiceId(invoiceId: string): Promise<InvoiceLine[]> {
    const { data, error } = await this.supabase
      .from("invoice_lines")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }

  async updateLine(line: InvoiceLine): Promise<void> {
    const { error } = await this.supabase
      .from("invoice_lines")
      .update({
        description: line.description,
        type: line.type,
        cost_center_id: line.costCenterId,
        cost_center_category_id: line.costCenterCategoryId,
        category: line.category,
        subcategory: line.subcategory,
        stock_item_id: line.stockItemId,
        quantity: line.quantity,
        unit: line.unit,
        unit_cost_without_vat: line.unitCostWithoutVat,
        vat_rate: line.vatRate,
        vat_amount: line.vatAmount,
        total_with_vat: line.totalWithVat,
        stock_entry_id: line.stockEntryId,
        affects_dre: line.affectsDre,
        affects_cashflow: line.affectsCashflow,
        affects_profitability: line.affectsProfitability,
      })
      .eq("id", line.id);
    if (error) throw new Error(error.message);
  }

  async deleteByInvoiceId(invoiceId: string): Promise<void> {
    const { error } = await this.supabase
      .from("invoice_lines")
      .delete()
      .eq("invoice_id", invoiceId);
    if (error) throw new Error(error.message);
  }
}
