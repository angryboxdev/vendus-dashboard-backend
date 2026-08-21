import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceMarkPaidPort } from "../../domain/ports/out/invoice-mark-paid.port.js";

/**
 * Cross-module adapter — acede directamente à tabela invoices sem importar
 * código do módulo invoices.
 *
 * Chamado quando uma obrigação com invoiceId é marcada como paga,
 * para sincronizar o estado da fatura correspondente.
 */
export class SupabaseInvoiceMarkPaidAdapter implements InvoiceMarkPaidPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async markPaid(invoiceId: string, paidAt: Date): Promise<void> {
    const { error } = await this.supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: paidAt.toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .neq("status", "cancelled");

    if (error) throw new Error(`Invoice mark-paid failed: ${error.message}`);
  }
}
