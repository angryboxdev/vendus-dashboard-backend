import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InvoiceReadPort, InvoiceSnapshot } from "../../domain/ports/out/invoice-read.port.js";

const SELECT =
  "id, supplier_id, supplier_name, invoice_date, cost_center_group_id, cost_center_category_id, document_type, total_with_vat, due_date, status, paid_at, payment_group_id";

function toSnapshot(row: Record<string, unknown>): InvoiceSnapshot {
  return {
    id: row.id as string,
    supplierId: (row.supplier_id as string | null) ?? null,
    supplierName: row.supplier_name as string,
    invoiceDate: String(row.invoice_date).slice(0, 10),
    costCenterGroupId: (row.cost_center_group_id as string | null) ?? null,
    costCenterCategoryId: (row.cost_center_category_id as string | null) ?? null,
    documentType: (row.document_type as string | null) ?? "invoice",
    totalWithVatCents: row.total_with_vat as number,
    dueDate: (row.due_date as string | null) ?? null,
    status: row.status as string,
    paidAt: (row.paid_at as string | null) ?? null,
    paymentGroupId: (row.payment_group_id as string | null) ?? null,
  };
}

/**
 * Adapter cross-módulo — lê dados mínimos da tabela `invoices`
 * sem importar código do módulo invoices.
 *
 * Campos lidos: id, fornecedor, data de emissão, categoria/sub-categoria, tipo de documento,
 * total, vencimento, estado, data de pagamento e grupo do documento de pagamento.
 */
export class SupabaseInvoiceReadAdapter implements InvoiceReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId, id: string): Promise<InvoiceSnapshot | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return toSnapshot(data as unknown as Record<string, unknown>);
  }

  async findPaymentGroupMembers(organizationId: OrganizationId, invoiceIds: string[]): Promise<Map<string, InvoiceSnapshot[]>> {
    const out = new Map<string, InvoiceSnapshot[]>();
    const ids = [...new Set(invoiceIds)];
    if (!ids.length) return out;
    const { data, error } = await this.scopedQuery(organizationId).table("invoices").select(SELECT).in("id", ids);
    if (error) throw new Error(error.message);
    const own = ((data ?? []) as unknown as Record<string, unknown>[]).map(toSnapshot);

    const groupIds = [...new Set(own.map((i) => i.paymentGroupId).filter((g): g is string => g !== null))];
    const byGroup = new Map<string, InvoiceSnapshot[]>();
    if (groupIds.length) {
      const res = await this.scopedQuery(organizationId)
        .table("invoices")
        .select(SELECT)
        .in("payment_group_id", groupIds)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true });
      if (res.error) throw new Error(res.error.message);
      for (const m of ((res.data ?? []) as unknown as Record<string, unknown>[]).map(toSnapshot)) {
        byGroup.set(m.paymentGroupId!, [...(byGroup.get(m.paymentGroupId!) ?? []), m]);
      }
    }
    for (const inv of own) out.set(inv.id, inv.paymentGroupId ? byGroup.get(inv.paymentGroupId) ?? [inv] : [inv]);
    return out;
  }

  async findByPaymentGroup(organizationId: OrganizationId, paymentGroupId: string): Promise<InvoiceSnapshot[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .select(SELECT)
      .eq("payment_group_id", paymentGroupId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toSnapshot);
  }
}
