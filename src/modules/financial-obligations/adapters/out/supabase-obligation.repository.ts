import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FinancialObligation,
  type ObligationSource,
  type ObligationStatus,
  type PaymentMethod,
} from "../../domain/entities/financial-obligation.js";
import type {
  FinancialObligationRepositoryPort,
  ObligationFilter,
} from "../../domain/ports/out/obligation-repository.port.js";

// ── helpers ───────────────────────────────────────────────────────────────────

type OccurrenceRow = {
  recurrence_id: string;
  document_url: string | null;
  recurring_contracts: { name: string } | null;
};

function toEntity(row: Record<string, unknown>): FinancialObligation {
  const occurrences = (row.recurring_occurrences as OccurrenceRow[] | null) ?? [];
  const occ = occurrences[0] ?? null;
  const contract = occ?.recurring_contracts ?? null;

  return FinancialObligation.reconstitute({
    id: row.id as string,
    source: row.source as ObligationSource,
    supplierId: (row.supplier_id as string | null) ?? null,
    supplierName: row.supplier_name as string,
    description: row.description as string,
    amountCents: row.amount as number,
    dueDate: new Date(row.due_date as string),
    paidAt: row.paid_at ? new Date(row.paid_at as string) : null,
    paymentMethod: (row.payment_method as PaymentMethod | null) ?? null,
    status: row.status as ObligationStatus,
    invoiceId: (row.invoice_id as string | null) ?? null,
    recurrenceId: occ ? occ.recurrence_id : null,
    recurrenceName: contract ? contract.name : null,
    documentUrl: occ ? (occ.document_url ?? null) : null,
    costCenterId: (row.cost_center_id as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

const OBLIGATION_SELECT = `
  *,
  recurring_occurrences(recurrence_id, document_url, recurring_contracts(name))
`.trim();

// ── repository ────────────────────────────────────────────────────────────────

export class SupabaseObligationRepository implements FinancialObligationRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(obligation: FinancialObligation): Promise<void> {
    const { error } = await this.supabase.from("payable_entries").insert({
      id: obligation.id,
      source: obligation.source,
      invoice_id: obligation.invoiceId,
      supplier_id: obligation.supplierId,
      supplier_name: obligation.supplierName,
      description: obligation.description,
      cost_center_id: obligation.costCenterId,
      amount: obligation.amountCents,
      due_date: obligation.dueDate.toISOString().slice(0, 10),
      paid_at: null,
      payment_method: obligation.paymentMethod,
      recurrence: "none",
      status: obligation.status,
      notes: null,
      created_at: obligation.createdAt.toISOString(),
      updated_at: obligation.updatedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async findById(id: string): Promise<FinancialObligation | null> {
    const { data, error } = await this.supabase
      .from("payable_entries")
      .select(OBLIGATION_SELECT)
      .eq("id", id)
      .in("source", ["recurrence", "manual"])
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }

  async findAll(filter?: ObligationFilter): Promise<FinancialObligation[]> {
    const sources: ObligationSource[] = filter?.source
      ? [filter.source]
      : ["recurrence", "manual"];

    let q = this.supabase
      .from("payable_entries")
      .select(OBLIGATION_SELECT)
      .in("source", sources)
      .order("due_date", { ascending: true });

    if (filter?.supplierId) q = q.eq("supplier_id", filter.supplierId);
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.from) q = q.gte("due_date", filter.from.toISOString().slice(0, 10));
    if (filter?.to) q = q.lte("due_date", filter.to.toISOString().slice(0, 10));

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as unknown as Record<string, unknown>));
  }

  async update(obligation: FinancialObligation): Promise<void> {
    const { error } = await this.supabase
      .from("payable_entries")
      .update({
        status: obligation.status,
        paid_at: obligation.paidAt ? obligation.paidAt.toISOString().slice(0, 10) : null,
        payment_method: obligation.paymentMethod,
        updated_at: obligation.updatedAt.toISOString(),
      })
      .eq("id", obligation.id);
    if (error) throw new Error(error.message);
  }
}
