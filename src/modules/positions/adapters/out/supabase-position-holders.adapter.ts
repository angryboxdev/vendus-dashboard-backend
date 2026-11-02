import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { PositionAuditPort, PositionHoldersPort } from "../../domain/ports/out/position.ports.js";

/** Cargo e estado de cada colaborador (só para contar os ativos por cargo). */
export class SupabasePositionHoldersAdapter implements PositionHoldersPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async list(organizationId: OrganizationId) {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_employees").select("position_id, status").limit(10000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as { position_id: string | null; status: string }[]).map((r) => ({ positionId: r.position_id, active: r.status === "active" }));
  }
}

/**
 * Auditoria dos cargos em `hr_audit_logs` (onde já está o histórico). Como
 * antes, uma falha ao gravar a auditoria nunca interrompe a operação.
 */
export class SupabasePositionAuditAdapter implements PositionAuditPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async record(entry: Parameters<PositionAuditPort["record"]>[0]): Promise<void> {
    try {
      const { error } = await this.scopedQuery(entry.organizationId)
        .table("hr_audit_logs")
        .insert({
          id: crypto.randomUUID(),
          entity_type: "position",
          entity_id: entry.positionId,
          employee_id: null,
          action: entry.action,
          actor: entry.actor,
          description: entry.description,
          payload_before: entry.before ?? null,
          payload_after: entry.after ?? null,
          correlation_id: crypto.randomUUID(),
        });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error("[positions-audit] falha ao gravar auditoria (ignorada):", e);
    }
  }
}
