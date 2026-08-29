import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InvoiceReconciliationCleanupPort } from "../../domain/ports/out/invoice-reconciliation-cleanup.port.js";

/**
 * Adapter de limpeza de reconciliação para o módulo invoices.
 * Acede directamente às tabelas bank_movement_entity_links e bank_movements —
 * sem importar nenhum código do módulo bank-statements.
 *
 * Nunca guarda um `SupabaseClient` — recebe o factory `createScopedQuery`
 * (`ScopedQueryFactory`) injectado pelo composition root e constrói um
 * `ScopedQuery` por chamada (D2).
 */
export class SupabaseInvoiceReconciliationCleanupAdapter
  implements InvoiceReconciliationCleanupPort
{
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async removeLinksForInvoice(organizationId: OrganizationId, invoiceId: string): Promise<void> {
    // 1. Recolher os movement_ids afectados antes de apagar
    const { data: links, error: fetchErr } = await this.scopedQuery(organizationId)
      .table("bank_movement_entity_links")
      .select("movement_id")
      .eq("entity_type", "invoice")
      .eq("entity_id", invoiceId);
    if (fetchErr) throw new Error(fetchErr.message);

    const linkRows = (links ?? []) as unknown as Record<string, unknown>[];
    const affectedMovementIds = [...new Set(linkRows.map((l) => l.movement_id as string))];

    // 2. Apagar os links da fatura
    const { error: deleteErr } = await this.scopedQuery(organizationId)
      .table("bank_movement_entity_links")
      .delete()
      .eq("entity_type", "invoice")
      .eq("entity_id", invoiceId);
    if (deleteErr) throw new Error(deleteErr.message);

    // 3. Recalcular e actualizar o estado de conciliação de cada movimento afectado
    if (affectedMovementIds.length === 0) return;
    await this.recalculateMovementStatuses(organizationId, affectedMovementIds);
  }

  async renumberLinksForInvoice(organizationId: OrganizationId, invoiceId: string, newLabel: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("bank_movement_entity_links")
      .update({ entity_label: newLabel })
      .eq("entity_type", "invoice")
      .eq("entity_id", invoiceId);
    if (error) throw new Error(error.message);
  }

  private async recalculateMovementStatuses(organizationId: OrganizationId, movementIds: string[]): Promise<void> {
    const now = new Date().toISOString();

    // Buscar links restantes agrupados por movement_id
    const { data: remainingLinks, error: linksErr } = await this.scopedQuery(organizationId)
      .table("bank_movement_entity_links")
      .select("movement_id")
      .in("movement_id", movementIds);
    if (linksErr) throw new Error(linksErr.message);

    const linkCountByMovement = new Map<string, number>();
    for (const id of movementIds) linkCountByMovement.set(id, 0);
    for (const link of (remainingLinks ?? []) as unknown as Record<string, unknown>[]) {
      const movementId = link.movement_id as string;
      linkCountByMovement.set(movementId, (linkCountByMovement.get(movementId) ?? 0) + 1);
    }

    // Buscar tipo dos movimentos (debit/credit)
    const { data: movements, error: movErr } = await this.scopedQuery(organizationId)
      .table("bank_movements")
      .select("id, movement_type")
      .in("id", movementIds);
    if (movErr) throw new Error(movErr.message);

    for (const mov of (movements ?? []) as unknown as Record<string, unknown>[]) {
      const movId = mov.id as string;
      const remaining = linkCountByMovement.get(movId) ?? 0;

      if (remaining === 0) {
        // Sem ligações — reset total
        const resetStatus = mov.movement_type === "debit" ? "saida_nao_justificada" : "conciliado_sem_fatura";
        const { error } = await this.scopedQuery(organizationId)
          .table("bank_movements")
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
          .eq("id", movId);
        if (error) throw new Error(error.message);
      } else {
        // Ainda tem outras ligações — parcialmente conciliado
        const { error } = await this.scopedQuery(organizationId)
          .table("bank_movements")
          .update({ reconciliation_status: "conciliado_parcial", updated_at: now })
          .eq("id", movId);
        if (error) throw new Error(error.message);
      }
    }
  }
}
