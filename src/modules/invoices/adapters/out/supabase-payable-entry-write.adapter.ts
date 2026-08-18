import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";

/**
 * Adapter de escrita em payable_entries para o módulo invoices.
 * Acede directamente à tabela — sem importar nenhum código do módulo payable-entries.
 */
export class SupabasePayableEntryWriteAdapter implements PayableEntryWritePort {
  constructor(private readonly supabase: SupabaseClient) {}

  async createForInvoice(data: {
    invoiceId: string;
    supplierId: string | null;
    supplierName: string;
    invoiceNumber: string;
    dueDate: Date;
    amount: number;
  }): Promise<void> {
    // Idempotente: não cria se já existir entrada ligada a esta fatura
    const { data: existing } = await this.supabase
      .from("payable_entries")
      .select("id")
      .eq("invoice_id", data.invoiceId)
      .maybeSingle();
    if (existing) return;

    const now = new Date().toISOString();
    const { error } = await this.supabase.from("payable_entries").insert({
      id: crypto.randomUUID(),
      invoice_id: data.invoiceId,
      supplier_id: data.supplierId,
      supplier_name: data.supplierName,
      description: `Fatura ${data.invoiceNumber}`,
      amount: data.amount,
      due_date: data.dueDate.toISOString().slice(0, 10),
      recurrence: "none",
      status: "pending",
      created_at: now,
      updated_at: now,
    });
    if (error) throw new Error(error.message);
  }

  async markPaidByInvoiceId(invoiceId: string, paidAt: Date): Promise<void> {
    const { error } = await this.supabase
      .from("payable_entries")
      .update({
        status: "paid",
        paid_at: paidAt.toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_id", invoiceId)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
  }

  async cancelByInvoiceId(invoiceId: string): Promise<void> {
    const { error } = await this.supabase
      .from("payable_entries")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_id", invoiceId)
      .neq("status", "paid");
    if (error) throw new Error(error.message);
  }

  async renumberByInvoiceId(invoiceId: string, newInvoiceNumber: string): Promise<void> {
    const { error } = await this.supabase
      .from("payable_entries")
      .update({
        description: `Fatura ${newInvoiceNumber}`,
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_id", invoiceId)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
  }
}
