import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  StockCountAuditLogEntry,
  StockCountAuditLogPort,
  StockCountAuditLogRecordDTO,
} from "../../domain/ports/out/stock-count-audit-log.port.js";

export class FakeStockCountAuditLog implements StockCountAuditLogPort {
  readonly entries: StockCountAuditLogEntry[] = [];

  async record(entry: StockCountAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findByEntityId(_organizationId: OrganizationId, entityId: string): Promise<StockCountAuditLogRecordDTO[]> {
    return this.entries
      .filter((e) => e.entityId === entityId)
      .map((e, i) => ({
        id: `audit-${i}`,
        createdAt: new Date().toISOString(),
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        actor: e.actor,
        before: e.before,
        after: e.after,
        reason: e.reason ?? null,
      }))
      .reverse();
  }
}
