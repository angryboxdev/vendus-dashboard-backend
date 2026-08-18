import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceReconciliationCleanupPort } from "../../domain/ports/out/invoice-reconciliation-cleanup.port.js";

/**
 * Adapter de limpeza de reconciliação para o módulo invoices.
 * Acede directamente às tabelas bank_movement_entity_links e bank_movements —
 * sem importar nenhum código do módulo bank-statements.
 */
export class SupabaseInvoiceReconciliationCleanupAdapter
  implements InvoiceReconciliationCleanupPort
{
  constructor(private readonly supabase: SupabaseClient) {}

  async removeLinksForInvoice(invoiceId: string): Promise<void> {
    // 1. Recolher os movement_ids afectados antes de apagar
    const { data: links, error: fetchErr } = await this.supabase
      .from("bank_movement_entity_links")
      .select("movement_id")
      .eq("entity_type", "invoice")
      .eq("entity_id", invoiceId);
    if (fetchErr) throw new Error(fetchErr.message);

    const affectedMovementIds = [...new Set((links ?? []).map((l) => l.movement_id as string))];

    // 2. Apagar os links da fatura
    const { error: deleteErr } = await this.supabase
      .from("bank_movement_entity_links")
      .delete()
      .eq("entity_type", "invoice")
      .eq("entity_id", invoiceId);
    if (deleteErr) throw new Error(deleteErr.message);

    // 3. Recalcular e actualizar o estado de conciliação de cada movimento afectado
    if (affectedMovementIds.length === 0) return;
    await this.recalculateMovementStatuses(affectedMovementIds);
  }

  async renumberLinksForInvoice(invoiceId: string, newLabel: string): Promise<void> {
    const { error } = await this.supabase
      .from("bank_movement_entity_links")
      .update({ entity_label: newLabel })
      .eq("entity_type", "invoice")
      .eq("entity_id", invoiceId);
    if (error) throw new Error(error.message);
  }

  private async recalculateMovementStatuses(movementIds: string[]): Promise<void> {
    const now = new Date().toISOString();

    // Buscar links restantes agrupados por movement_id
    const { data: remainingLinks, error: linksErr } = await this.supabase
      .from("bank_movement_entity_links")
      .select("movement_id")
      .in("movement_id", movementIds);
    if (linksErr) throw new Error(linksErr.message);

    const linkCountByMovement = new Map<string, number>();
    for (const id of movementIds) linkCountByMovement.set(id, 0);
    for (const link of remainingLinks ?? []) {
      linkCountByMovement.set(link.movement_id, (linkCountByMovement.get(link.movement_id) ?? 0) + 1);
    }

    // Buscar tipo dos movimentos (debit/credit)
    const { data: movements, error: movErr } = await this.supabase
      .from("bank_movements")
      .select("id, movement_type")
      .in("id", movementIds);
    if (movErr) throw new Error(movErr.message);

    for (const mov of movements ?? []) {
      const remaining = linkCountByMovement.get(mov.id) ?? 0;

      if (remaining === 0) {
        // Sem ligações — reset total
        const resetStatus = mov.movement_type === "debit" ? "saida_nao_justificada" : "conciliado_sem_fatura";
        const { error } = await this.supabase
          .from("bank_movements")
          .update({
            reconciliation_status: resetStatus,
            justification_type: null,
            matched_entity_type: null,
            matched_entity_id: null,
            requires_document: false,
            confidence_score: null,
            reconciliation_amount_diff: null,
            updated_at: now,
          })
          .eq("id", mov.id);
        if (error) throw new Error(error.message);
      } else {
        // Ainda tem outras ligações — parcialmente conciliado
        const { error } = await this.supabase
          .from("bank_movements")
          .update({ reconciliation_status: "conciliado_parcial", updated_at: now })
          .eq("id", mov.id);
        if (error) throw new Error(error.message);
      }
    }
  }
}
