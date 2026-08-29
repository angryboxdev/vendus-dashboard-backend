import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { PayableEntryWritePort } from "../../domain/ports/out/payable-entry-write.port.js";

/**
 * Adapter de escrita em payable_entries para o módulo invoices.
 * Acede directamente à tabela — sem importar nenhum código do módulo payable-entries.
 *
 * Nunca guarda um `SupabaseClient` — recebe o factory `createScopedQuery`
 * (`ScopedQueryFactory`) injectado pelo composition root e constrói um
 * `ScopedQuery` por chamada (D2).
 */
export class SupabasePayableEntryWriteAdapter implements PayableEntryWritePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async createForInvoice(
    organizationId: OrganizationId,
    data: {
      invoiceId: string;
      supplierId: string | null;
      supplierName: string;
      invoiceNumber: string;
      dueDate: Date;
      amount: number;
    },
  ): Promise<void> {
    // Idempotente: não cria se já existir entrada ligada a esta fatura
    const { data: existing } = await this.scopedQuery(organizationId)
      .table("payable_entries")
      .select("id")
      .eq("invoice_id", data.invoiceId)
      .maybeSingle();
    if (existing) return;

    const now = new Date().toISOString();
    const { error } = await this.scopedQuery(organizationId).table("payable_entries").insert({
      id: crypto.randomUUID(),
      source: "invoice",
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

  async markPaidByInvoiceId(organizationId: OrganizationId, invoiceId: string, paidAt: Date): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("payable_entries")
      .update({
        status: "paid",
        paid_at: paidAt.toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_id", invoiceId)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
  }

  async cancelByInvoiceId(organizationId: OrganizationId, invoiceId: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("payable_entries")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_id", invoiceId)
      .neq("status", "paid");
    if (error) throw new Error(error.message);
  }

  async renumberByInvoiceId(organizationId: OrganizationId, invoiceId: string, newInvoiceNumber: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("payable_entries")
      .update({
        description: `Fatura ${newInvoiceNumber}`,
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_id", invoiceId)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
  }
}
