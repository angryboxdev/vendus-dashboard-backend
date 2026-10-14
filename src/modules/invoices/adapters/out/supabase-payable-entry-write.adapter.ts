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
    // Idempotente: uma obrigação ATIVA por fatura (task v1.2 §1.2). A leitura evita o trabalho;
    // o índice único parcial decide a corrida (23505 → outro pedido já a criou).
    const { data: existing, error: readError } = await this.scopedQuery(organizationId)
      .table("payable_entries")
      .select("id")
      .eq("invoice_id", data.invoiceId)
      .neq("status", "cancelled")
      .limit(1);
    if (readError) throw new Error(readError.message);
    if ((existing ?? []).length) return;

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
    if (error && (error as { code?: string }).code !== "23505") throw new Error(error.message);
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

  async activeStatusOf(organizationId: OrganizationId, invoiceId: string): Promise<"none" | "open" | "settled"> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("payable_entries")
      .select("status")
      .eq("invoice_id", invoiceId)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
    const statuses = ((data ?? []) as unknown as { status: string }[]).map((r) => r.status);
    if (!statuses.length) return "none";
    return statuses.some((s) => s === "paid") ? "settled" : "open";
  }

  async syncOpenForInvoice(organizationId: OrganizationId, invoiceId: string, data: { amount: number; dueDate: Date | null }): Promise<void> {
    const update: Record<string, unknown> = { amount: data.amount, updated_at: new Date().toISOString() };
    if (data.dueDate) update.due_date = data.dueDate.toISOString().slice(0, 10);
    const { error } = await this.scopedQuery(organizationId)
      .table("payable_entries")
      .update(update)
      .eq("invoice_id", invoiceId)
      .in("status", ["pending", "overdue"]);
    if (error) throw new Error(error.message);
  }

  async listDuplicateActive(organizationId: OrganizationId) {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("payable_entries")
      .select("id, invoice_id, status")
      .not("invoice_id", "is", null)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
    const by = new Map<string, { payableIds: string[]; statuses: string[] }>();
    for (const r of (data ?? []) as unknown as { id: string; invoice_id: string; status: string }[]) {
      const g = by.get(r.invoice_id) ?? { payableIds: [], statuses: [] };
      g.payableIds.push(r.id);
      g.statuses.push(r.status);
      by.set(r.invoice_id, g);
    }
    return [...by].filter(([, g]) => g.payableIds.length > 1).map(([invoiceId, g]) => ({ invoiceId, ...g }));
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
