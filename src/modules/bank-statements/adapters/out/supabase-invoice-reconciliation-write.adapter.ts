import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceReconciliationWritePort } from "../../domain/ports/out/invoice-reconciliation-write.port.js";

/**
 * Cross-module adapter: writes to the `invoices` table without importing
 * any code from the invoices module (mirrors SupabaseInvoiceMatchReadAdapter).
 */
export class SupabaseInvoiceReconciliationWriteAdapter implements InvoiceReconciliationWritePort {
  constructor(private readonly supabase: SupabaseClient) {}

  async markReconciled(invoiceId: string, movementDate: Date): Promise<void> {
    // First: mark as paid if not already paid (preserves existing paid_at)
    const paidAt = movementDate.toISOString().slice(0, 10);
    await this.supabase
      .from("invoices")
      .update({ status: "paid", paid_at: paidAt })
      .eq("id", invoiceId)
      .neq("status", "paid");

    // Second: always update reconciliation_status
    const { error } = await this.supabase
      .from("invoices")
      .update({ reconciliation_status: "reconciled" })
      .eq("id", invoiceId);

    if (error) throw new Error(error.message);
  }

  async markPartiallyReconciled(invoiceId: string): Promise<void> {
    const { error } = await this.supabase
      .from("invoices")
      .update({ reconciliation_status: "partially_reconciled" })
      .eq("id", invoiceId);

    if (error) throw new Error(error.message);
  }

  async markUnreconciled(invoiceId: string): Promise<void> {
    const { error } = await this.supabase
      .from("invoices")
      .update({ reconciliation_status: "pending_reconciliation" })
      .eq("id", invoiceId);

    if (error) throw new Error(error.message);
  }
}
