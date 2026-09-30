import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  StockReviewAuditEntityType,
  StockReviewAuditLogEntry,
  StockReviewAuditLogPort,
  StockReviewAuditLogRecordDTO,
} from "../../domain/ports/out/stock-review-audit-log.port.js";

interface Row {
  id: string;
  created_at: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string | null;
  payload_before: unknown;
  payload_after: unknown;
  reason: string | null;
}

function rowToDto(row: Row): StockReviewAuditLogRecordDTO {
  return {
    id: row.id,
    createdAt: row.created_at,
    entityType: row.entity_type as StockReviewAuditEntityType,
    entityId: row.entity_id,
    action: row.action,
    actor: row.actor ?? "—",
    before: row.payload_before,
    after: row.payload_after,
    reason: row.reason,
  };
}

/** Fire-and-forget (mesmo comportamento de `SupabaseAccountingAuditLogAdapter`/`SupabaseHrAuditLogAdapter`). */
export class SupabaseStockReviewAuditLogAdapter implements StockReviewAuditLogPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async record(entry: StockReviewAuditLogEntry): Promise<void> {
    try {
      const { error } = await this.scopedQuery(entry.organizationId)
        .table("stock_review_audit_logs")
        .insert({
          id: randomUUID(),
          entity_type: entry.entityType,
          entity_id: entry.entityId,
          action: entry.action,
          actor: entry.actor,
          payload_before: entry.before ?? null,
          payload_after: entry.after ?? null,
          reason: entry.reason ?? null,
        });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error("[stock-review-audit-log] falha ao gravar auditoria (ignorada):", e);
    }
  }

  async findByEntityId(organizationId: OrganizationId, entityId: string): Promise<StockReviewAuditLogRecordDTO[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("stock_review_audit_logs")
      .select("id, created_at, entity_type, entity_id, action, actor, payload_before, payload_after, reason")
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(rowToDto);
  }
}
