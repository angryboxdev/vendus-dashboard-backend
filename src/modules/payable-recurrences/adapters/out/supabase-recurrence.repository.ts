import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Recurrence,
  type RecurrenceType,
  type RecurrenceFrequency,
  type RecurrenceStatus,
  type PaymentMethod,
} from "../../domain/entities/recurrence.js";
import type { RecurrenceRepositoryPort, RecurrenceFilter } from "../../domain/ports/out/recurrence-repository.port.js";

function toEntity(row: Record<string, unknown>): Recurrence {
  return Recurrence.reconstitute({
    id: row.id as string,
    name: row.name as string,
    supplierId: (row.supplier_id as string | null) ?? null,
    supplierName: row.supplier_name as string,
    type: row.type as RecurrenceType,
    frequency: row.frequency as RecurrenceFrequency,
    costCenterId: (row.cost_center_id as string | null) ?? null,
    costCenterCategoryId: (row.cost_center_category_id as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    estimatedAmountCents: row.estimated_amount_cents as number,
    dayOfMonth: row.day_of_month as number,
    startDate: new Date(row.start_date as string),
    endDate: row.end_date ? new Date(row.end_date as string) : null,
    paymentMethod: row.payment_method as PaymentMethod,
    autoCreatePayable: row.auto_create_payable as boolean,
    requireInvoice: row.require_invoice as boolean,
    status: row.status as RecurrenceStatus,
    notes: (row.notes as string | null) ?? null,
    documentUrl: (row.document_url as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  });
}

function toRow(r: Recurrence): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    supplier_id: r.supplierId,
    supplier_name: r.supplierName,
    type: r.type,
    frequency: r.frequency,
    cost_center_id: r.costCenterId,
    cost_center_category_id: r.costCenterCategoryId,
    category: r.category,
    estimated_amount_cents: r.estimatedAmountCents,
    day_of_month: r.dayOfMonth,
    start_date: r.startDate.toISOString().slice(0, 10),
    end_date: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
    payment_method: r.paymentMethod,
    auto_create_payable: r.autoCreatePayable,
    require_invoice: r.requireInvoice,
    status: r.status,
    notes: r.notes,
    document_url: r.documentUrl,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export class SupabaseRecurrenceRepository implements RecurrenceRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(recurrence: Recurrence): Promise<void> {
    const { error } = await this.supabase.from("recurring_contracts").insert(toRow(recurrence));
    if (error) throw new Error(error.message);
  }

  async update(recurrence: Recurrence): Promise<void> {
    const { id, created_at, ...rest } = toRow(recurrence);
    const { error } = await this.supabase
      .from("recurring_contracts")
      .update(rest)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async findById(id: string): Promise<Recurrence | null> {
    const { data, error } = await this.supabase
      .from("recurring_contracts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as Record<string, unknown>);
  }

  async findAll(filter?: RecurrenceFilter): Promise<Recurrence[]> {
    let q = this.supabase
      .from("recurring_contracts")
      .select("*")
      .order("name", { ascending: true });

    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.type) q = q.eq("type", filter.type);
    if (filter?.supplierId) q = q.eq("supplier_id", filter.supplierId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toEntity(r as Record<string, unknown>));
  }
}
