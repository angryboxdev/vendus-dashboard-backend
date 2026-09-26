import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  HrAuditEntityType,
  HrAuditLogEntry,
  HrAuditLogPort,
  HrAuditLogRecordDTO,
} from "../../domain/ports/out/hr-audit-log.port.js";

const SELECT = "id, created_at, entity_type, entity_id, action, actor, description, payload_before, payload_after, correlation_id";

interface Row {
  id: string;
  created_at: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string | null;
  description: string;
  payload_before: unknown;
  payload_after: unknown;
  correlation_id: string | null;
}

function rowToDto(row: Row): HrAuditLogRecordDTO {
  return {
    id: row.id,
    createdAt: row.created_at,
    entityType: row.entity_type as HrAuditEntityType,
    entityId: row.entity_id,
    action: row.action,
    actor: row.actor ?? "—",
    description: row.description,
    before: row.payload_before,
    after: row.payload_after,
    correlationId: row.correlation_id,
  };
}

/**
 * Fire-and-forget (mesmo comportamento do `hrAuditService` legacy): uma
 * falha ao gravar auditoria nunca deve propagar para o fluxo principal do
 * use case — regista o erro em stderr e segue em frente.
 */
export class SupabaseHrAuditLogAdapter implements HrAuditLogPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async record(entry: HrAuditLogEntry): Promise<void> {
    try {
      const { error } = await this.scopedQuery(entry.organizationId)
        .table("hr_audit_logs")
        .insert({
          id: randomUUID(),
          entity_type: entry.entityType,
          entity_id: entry.entityId,
          employee_id: entry.employeeId,
          action: entry.action,
          actor: entry.actor,
          description: entry.description,
          payload_before: entry.before ?? null,
          payload_after: entry.after ?? null,
          correlation_id: entry.correlationId,
        });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error("[hr-audit-log] falha ao gravar auditoria (ignorada):", e);
    }
  }

  async findByEmployeeId(
    organizationId: OrganizationId,
    employeeId: string,
    pagination: { page: number; pageSize: number },
  ): Promise<{ items: HrAuditLogRecordDTO[]; total: number }> {
    const start = (pagination.page - 1) * pagination.pageSize;
    const { data, error, count } = await this.scopedQuery(organizationId)
      .table("hr_audit_logs")
      .select(SELECT, { count: "exact" })
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .range(start, start + pagination.pageSize - 1);
    if (error) throw new Error(error.message);
    return { items: ((data ?? []) as unknown as Row[]).map(rowToDto), total: count ?? 0 };
  }
}
