import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Invoice,
  type InvoiceStatus,
  type InvoiceSource,
  type AiExtractionStatus,
} from "../../domain/entities/invoice.js";
import type { InvoiceFilter, InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";

function toEntity(row: Record<string, unknown>): Invoice {
  return Invoice.reconstitute({
    id: row.id as string,
    supplierId: (row.supplier_id as string | null) ?? null,
    supplierName: row.supplier_name as string,
    supplierNifSnapshot: (row.supplier_nif_snapshot as string | null) ?? null,
    invoiceNumber: row.invoice_number as string,
    invoiceDate: new Date(row.invoice_date as string),
    dueDate: row.due_date ? new Date(row.due_date as string) : null,
    paidAt: row.paid_at ? new Date(row.paid_at as string) : null,
    subtotalWithoutVat: row.subtotal_without_vat as number,
    totalVat: row.total_vat as number,
    totalWithVat: row.total_with_vat as number,
    status: row.status as InvoiceStatus,
    notes: (row.notes as string | null) ?? null,
    attachmentUrl: (row.attachment_url as string | null) ?? null,
    source: ((row.source as string | null) ?? "manual") as InvoiceSource,
    aiExtractionStatus: (row.ai_extraction_status as AiExtractionStatus | null) ?? null,
    aiConfidence: (row.ai_confidence as number | null) ?? null,
    requiresReview: (row.requires_review as boolean | null) ?? false,
    costCenterGroupId: (row.cost_center_group_id as string | null) ?? null,
    financialType: (row.financial_type as string | null) ?? null,
    affectsDre: (row.affects_dre as boolean | null) ?? true,
    affectsCashflow: (row.affects_cashflow as boolean | null) ?? true,
    affectsProfitability: (row.affects_profitability as boolean | null) ?? false,
    currency: (row.currency as string | null) ?? "EUR",
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

function toRow(invoice: Invoice): Record<string, unknown> {
  return {
    id: invoice.id,
    supplier_id: invoice.supplierId,
    supplier_name: invoice.supplierName,
    supplier_nif_snapshot: invoice.supplierNifSnapshot,
    invoice_number: invoice.invoiceNumber,
    invoice_date: invoice.invoiceDate.toISOString().slice(0, 10),
    due_date: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
    paid_at: invoice.paidAt?.toISOString().slice(0, 10) ?? null,
    subtotal_without_vat: invoice.subtotalWithoutVat,
    total_vat: invoice.totalVat,
    total_with_vat: invoice.totalWithVat,
    status: invoice.status,
    notes: invoice.notes,
    attachment_url: invoice.attachmentUrl,
    source: invoice.source,
    ai_extraction_status: invoice.aiExtractionStatus,
    ai_confidence: invoice.aiConfidence,
    requires_review: invoice.requiresReview,
    cost_center_group_id: invoice.costCenterGroupId,
    financial_type: invoice.financialType,
    affects_dre: invoice.affectsDre,
    affects_cashflow: invoice.affectsCashflow,
    affects_profitability: invoice.affectsProfitability,
    currency: invoice.currency,
    created_at: invoice.createdAt.toISOString(),
    updated_at: invoice.updatedAt.toISOString(),
  };
}

export class SupabaseInvoiceRepository implements InvoiceRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(invoice: Invoice): Promise<void> {
    const { error } = await this.supabase.from("invoices").insert(toRow(invoice));
    if (error) throw new Error(error.message);
  }

  async findById(id: string): Promise<Invoice | null> {
    const { data, error } = await this.supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async findAll(filter?: InvoiceFilter): Promise<Invoice[]> {
    // Handle costCenterId filter via subquery on invoice_lines
    if (filter?.costCenterId) {
      const { data: lineRows } = await this.supabase
        .from("invoice_lines")
        .select("invoice_id")
        .eq("cost_center_id", filter.costCenterId);
      const ids = [...new Set((lineRows ?? []).map((r) => (r as Record<string, unknown>).invoice_id as string))];
      if (ids.length === 0) return [];

      let q = this.supabase
        .from("invoices")
        .select("*")
        .in("id", ids)
        .order("invoice_date", { ascending: false });
      if (filter.supplierId) q = q.eq("supplier_id", filter.supplierId);
      if (filter.status) q = q.eq("status", filter.status);
      if (filter.from) q = q.gte("invoice_date", filter.from.toISOString().slice(0, 10));
      if (filter.to) q = q.lte("invoice_date", filter.to.toISOString().slice(0, 10));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
    }

    let q = this.supabase
      .from("invoices")
      .select("*")
      .order("invoice_date", { ascending: false });

    if (filter?.supplierId) q = q.eq("supplier_id", filter.supplierId);
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.from) q = q.gte("invoice_date", filter.from.toISOString().slice(0, 10));
    if (filter?.to) q = q.lte("invoice_date", filter.to.toISOString().slice(0, 10));

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }

  async update(invoice: Invoice): Promise<void> {
    const row = toRow(invoice);
    const { id, created_at, ...updateFields } = row;
    const { error } = await this.supabase
      .from("invoices")
      .update(updateFields)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from("invoices").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async findDuplicate(invoiceNumber: string, supplierId: string, excludeId?: string): Promise<Invoice | null> {
    let q = this.supabase
      .from("invoices")
      .select("*")
      .eq("invoice_number", invoiceNumber)
      .eq("supplier_id", supplierId)
      .neq("status", "cancelled")
      .limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return null;
    return toEntity(data[0] as Record<string, unknown>);
  }

  async findDuplicateByNif(invoiceNumber: string, supplierNif: string, excludeId?: string): Promise<Invoice | null> {
    let q = this.supabase
      .from("invoices")
      .select("*")
      .eq("invoice_number", invoiceNumber)
      .eq("supplier_nif_snapshot", supplierNif)
      .neq("status", "cancelled")
      .limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return null;
    return toEntity(data[0] as Record<string, unknown>);
  }
}
