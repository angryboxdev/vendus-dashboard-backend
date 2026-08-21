import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayableEntryWritePort, CreatePayableData } from "../../domain/ports/out/payable-entry-write.port.js";

/**
 * Adapter cross-módulo — acede directamente à tabela `payable_entries`
 * sem importar código do módulo payable-entries.
 *
 * Cria entradas com:
 *  - recurrence: "none"  (a origem é a recorrência, não o campo legado)
 *  - status: "pending"
 *  - invoice_id: null    (a ligação à fatura é gerida pela ocorrência)
 */
export class SupabasePayableEntryWriteAdapter implements PayableEntryWritePort {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(data: CreatePayableData): Promise<{ id: string }> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error } = await this.supabase.from("payable_entries").insert({
      id,
      source: "recurrence",
      invoice_id: null,
      supplier_id: data.supplierId,
      supplier_name: data.supplierName,
      description: data.description,
      cost_center_id: data.costCenterId,
      category: data.category,
      amount: data.amountCents,
      due_date: data.dueDate,
      paid_at: null,
      recurrence: "none",
      status: "pending",
      notes: data.notes,
      created_at: now,
      updated_at: now,
    });

    if (error) throw new Error(error.message);
    return { id };
  }
}
