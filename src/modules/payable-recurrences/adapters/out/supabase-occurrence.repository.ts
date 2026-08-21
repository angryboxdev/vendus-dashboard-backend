import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RecurrenceOccurrence,
  type OccurrenceStatus,
  type OccurrencePaymentMethod,
} from "../../domain/entities/recurrence-occurrence.js";
import type { OccurrenceRepositoryPort, OccurrenceFilter } from "../../domain/ports/out/occurrence-repository.port.js";

function toEntity(row: Record<string, unknown>): RecurrenceOccurrence {
  return RecurrenceOccurrence.reconstitute({
    id: row.id as string,
    recurrenceId: row.recurrence_id as string,
    period: row.period as string,
    estimatedAmountCents: row.estimated_amount_cents as number,
    realAmountCents: (row.real_amount_cents as number | null) ?? null,
    dueDate: new Date(row.due_date as string),
    status: row.status as OccurrenceStatus,
    requireInvoice: row.require_invoice as boolean,
    invoiceId: (row.invoice_id as string | null) ?? null,
    paidAt: row.paid_at ? new Date(row.paid_at as string) : null,
    paymentMethod: (row.payment_method as OccurrencePaymentMethod | null) ?? null,
    paymentBankAccountId: (row.payment_bank_account_id as string | null) ?? null,
    paymentNotes: (row.payment_notes as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    documentUrl: (row.document_url as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

function toRow(o: RecurrenceOccurrence): Record<string, unknown> {
  return {
    id: o.id,
    recurrence_id: o.recurrenceId,
    period: o.period,
    estimated_amount_cents: o.estimatedAmountCents,
    real_amount_cents: o.realAmountCents,
    due_date: o.dueDate.toISOString().slice(0, 10),
    status: o.status,
    require_invoice: o.requireInvoice,
    invoice_id: o.invoiceId,
    paid_at: o.paidAt ? o.paidAt.toISOString() : null,
    payment_method: o.paymentMethod,
    payment_bank_account_id: o.paymentBankAccountId,
    payment_notes: o.paymentNotes,
    notes: o.notes,
    document_url: o.documentUrl,
    created_at: o.createdAt.toISOString(),
    updated_at: o.updatedAt.toISOString(),
  };
}

export class SupabaseOccurrenceRepository implements OccurrenceRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(occurrence: RecurrenceOccurrence): Promise<void> {
    const { error } = await this.supabase.from("recurring_occurrences").insert(toRow(occurrence));
    if (error) throw new Error(error.message);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("recurring_occurrences")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async update(occurrence: RecurrenceOccurrence): Promise<void> {
    const { id, created_at, recurrence_id, ...rest } = toRow(occurrence);
    const { error } = await this.supabase
      .from("recurring_occurrences")
      .update(rest)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async findById(id: string): Promise<RecurrenceOccurrence | null> {
    const { data, error } = await this.supabase
      .from("recurring_occurrences")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async findAll(filter?: OccurrenceFilter): Promise<RecurrenceOccurrence[]> {
    let q = this.supabase
      .from("recurring_occurrences")
      .select("*")
      .order("due_date", { ascending: true });

    if (filter?.recurrenceId) q = q.eq("recurrence_id", filter.recurrenceId);
    if (filter?.period) q = q.eq("period", filter.period);
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.invoiceId) q = q.eq("invoice_id", filter.invoiceId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }

  async findByRecurrenceAndPeriod(recurrenceId: string, period: string): Promise<RecurrenceOccurrence | null> {
    const { data, error } = await this.supabase
      .from("recurring_occurrences")
      .select("*")
      .eq("recurrence_id", recurrenceId)
      .eq("period", period)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async findLinkedInvoiceIds(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("recurring_occurrences")
      .select("invoice_id")
      .not("invoice_id", "is", null);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.invoice_id as string);
  }

  async countByStatus(): Promise<Partial<Record<OccurrenceStatus, number>>> {
    const { data, error } = await this.supabase
      .from("recurring_occurrences")
      .select("status");
    if (error) throw new Error(error.message);
    const counts: Partial<Record<OccurrenceStatus, number>> = {};
    for (const row of data ?? []) {
      const s = row.status as OccurrenceStatus;
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }
}
