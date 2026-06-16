import type { SupabaseClient } from "@supabase/supabase-js";
import { Invoice, type InvoiceStatus } from "../../domain/entities/invoice.js";
import type { InvoiceFilter, InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";

function toEntity(row: Record<string, unknown>): Invoice {
  return Invoice.reconstitute({
    id: row.id as string,
    supplierId: (row.supplier_id as string | null) ?? null,
    supplierName: row.supplier_name as string,
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
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

export class SupabaseInvoiceRepository implements InvoiceRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(invoice: Invoice): Promise<void> {
    const { error } = await this.supabase.from("invoices").insert({
      id: invoice.id,
      supplier_id: invoice.supplierId,
      supplier_name: invoice.supplierName,
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
      created_at: invoice.createdAt.toISOString(),
      updated_at: invoice.updatedAt.toISOString(),
    });
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
    const { error } = await this.supabase
      .from("invoices")
      .update({
        supplier_id: invoice.supplierId,
        supplier_name: invoice.supplierName,
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
        updated_at: invoice.updatedAt.toISOString(),
      })
      .eq("id", invoice.id);
    if (error) throw new Error(error.message);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from("invoices").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}
