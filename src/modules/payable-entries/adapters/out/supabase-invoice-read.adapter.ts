import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InvoiceSnapshot, InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";

/**
 * Adapter de leitura de faturas para o módulo payable-entries.
 * Acede directamente à tabela `invoices` — sem importar nenhum código do
 * módulo invoices, mantendo os módulos independentes. Nunca guarda um
 * `SupabaseClient`: recebe o `ScopedQueryFactory` no construtor (D2) e
 * constrói um helper escopado por chamada.
 */
export class SupabaseInvoiceReadAdapter implements InvoiceReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId, id: string): Promise<InvoiceSnapshot | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .select("id, supplier_id, supplier_name, invoice_number, due_date, total_with_vat, status")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as unknown as Record<string, unknown>;
    return {
      id: row.id as string,
      supplierId: (row.supplier_id as string | null) ?? null,
      supplierName: row.supplier_name as string,
      invoiceNumber: row.invoice_number as string,
      dueDate: (row.due_date as string | null) ?? null,
      totalWithVat: row.total_with_vat as number,
      status: row.status as string,
    };
  }

  async markPaid(organizationId: OrganizationId, invoiceId: string, paidAt: Date): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .update({
        status: "paid",
        paid_at: paidAt.toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
  }
}
