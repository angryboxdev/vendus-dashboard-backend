import type { SupabaseClient } from "@supabase/supabase-js";
import { PayableEntry, type PayableStatus, type RecurrenceType } from "../../domain/entities/payable-entry.js";
import type { PayableEntryFilter, PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";

function toEntity(row: Record<string, unknown>): PayableEntry {
  return PayableEntry.reconstitute({
    id: row.id as string,
    invoiceId: (row.invoice_id as string | null) ?? null,
    supplierId: (row.supplier_id as string | null) ?? null,
    supplierName: row.supplier_name as string,
    description: row.description as string,
    costCenterId: (row.cost_center_id as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    amount: row.amount as number,
    dueDate: new Date(row.due_date as string),
    paidAt: row.paid_at ? new Date(row.paid_at as string) : null,
    recurrence: row.recurrence as RecurrenceType,
    status: row.status as PayableStatus,
    notes: (row.notes as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

export class SupabasePayableEntryRepository implements PayableEntryRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(entry: PayableEntry): Promise<void> {
    const { error } = await this.supabase.from("payable_entries").insert({
      id: entry.id,
      invoice_id: entry.invoiceId,
      supplier_id: entry.supplierId,
      supplier_name: entry.supplierName,
      description: entry.description,
      cost_center_id: entry.costCenterId,
      category: entry.category,
      amount: entry.amount,
      due_date: entry.dueDate.toISOString().slice(0, 10),
      paid_at: entry.paidAt?.toISOString().slice(0, 10) ?? null,
      recurrence: entry.recurrence,
      status: entry.status,
      notes: entry.notes,
      created_at: entry.createdAt.toISOString(),
      updated_at: entry.updatedAt.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async findById(id: string): Promise<PayableEntry | null> {
    const { data, error } = await this.supabase
      .from("payable_entries")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async findAll(filter?: PayableEntryFilter): Promise<PayableEntry[]> {
    let q = this.supabase
      .from("payable_entries")
      .select("*")
      .order("due_date", { ascending: true });

    if (filter?.supplierId) q = q.eq("supplier_id", filter.supplierId);
    if (filter?.costCenterId) q = q.eq("cost_center_id", filter.costCenterId);
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.from) q = q.gte("due_date", filter.from.toISOString().slice(0, 10));
    if (filter?.to) q = q.lte("due_date", filter.to.toISOString().slice(0, 10));

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }

  async update(entry: PayableEntry): Promise<void> {
    const { error } = await this.supabase
      .from("payable_entries")
      .update({
        invoice_id: entry.invoiceId,
        supplier_id: entry.supplierId,
        supplier_name: entry.supplierName,
        description: entry.description,
        cost_center_id: entry.costCenterId,
        category: entry.category,
        amount: entry.amount,
        due_date: entry.dueDate.toISOString().slice(0, 10),
        paid_at: entry.paidAt?.toISOString().slice(0, 10) ?? null,
        recurrence: entry.recurrence,
        status: entry.status,
        notes: entry.notes,
        updated_at: entry.updatedAt.toISOString(),
      })
      .eq("id", entry.id);
    if (error) throw new Error(error.message);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from("payable_entries").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}
