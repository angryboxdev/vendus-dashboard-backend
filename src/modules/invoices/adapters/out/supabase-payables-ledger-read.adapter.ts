import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { LedgerPayable, PayablesLedgerReadPort } from "../../domain/ports/out/payables-ledger-read.port.js";

/**
 * Lê `payable_entries` (não canceladas) e `bank_movement_entity_links`
 * diretamente, sem importar os módulos payable-entries/bank-statements (D10).
 */
export class SupabasePayablesLedgerReadAdapter implements PayablesLedgerReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async listActivePayables(organizationId: OrganizationId): Promise<LedgerPayable[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("payable_entries")
      .select("id, invoice_id, status, amount, due_date, supplier_id, supplier_name, description")
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
    type Row = { id: string; invoice_id: string | null; status: string; amount: number; due_date: string | null; supplier_id: string | null; supplier_name: string; description: string };
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      invoiceId: r.invoice_id,
      status: r.status,
      amountCents: Number(r.amount),
      dueDate: r.due_date ? String(r.due_date).slice(0, 10) : null,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      description: r.description,
    }));
  }

  async allocatedByEntity(organizationId: OrganizationId) {
    const { data, error } = await this.scopedQuery(organizationId).table("bank_movement_entity_links").select("entity_type, entity_id, allocated_amount_cents");
    if (error) throw new Error(error.message);
    const invoice = new Map<string, number>();
    const payable = new Map<string, number>();
    for (const r of (data ?? []) as unknown as { entity_type: string; entity_id: string; allocated_amount_cents: number }[]) {
      const m = r.entity_type === "invoice" ? invoice : payable;
      m.set(r.entity_id, (m.get(r.entity_id) ?? 0) + Number(r.allocated_amount_cents));
    }
    return { invoice, payable };
  }
}
