import { randomUUID } from "crypto";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { DocumentAuditLogEntry, DocumentAuditLogPort } from "../../domain/ports/out/document-audit-log.port.js";

/** Fire-and-forget (mesmo comportamento de `SupabaseOrganizationAuditLogAdapter`). */
export class SupabaseDocumentAuditLogAdapter implements DocumentAuditLogPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async record(entry: DocumentAuditLogEntry): Promise<void> {
    try {
      const { error } = await this.scopedQuery(entry.organizationId)
        .table("document_audit_logs")
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
      console.error("[document-audit-log] falha ao gravar auditoria (ignorada):", e);
    }
  }
}
