import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceReadPort, InvoiceSnapshot } from "../../domain/ports/out/invoice-read.port.js";

/**
 * Adapter cross-módulo — lê dados mínimos da tabela `invoices`
 * sem importar código do módulo invoices.
 *
 * Campos lidos: id, supplier_id, supplier_name, total_with_vat, due_date.
 */
export class SupabaseInvoiceReadAdapter implements InvoiceReadPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(id: string): Promise<InvoiceSnapshot | null> {
    const { data, error } = await this.supabase
      .from("invoices")
      .select("id, supplier_id, supplier_name, total_with_vat, due_date, status, paid_at")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      supplierId: (row.supplier_id as string | null) ?? null,
      supplierName: row.supplier_name as string,
      totalWithVatCents: row.total_with_vat as number,
      dueDate: (row.due_date as string | null) ?? null,
      status: row.status as string,
      paidAt: (row.paid_at as string | null) ?? null,
    };
  }
}
