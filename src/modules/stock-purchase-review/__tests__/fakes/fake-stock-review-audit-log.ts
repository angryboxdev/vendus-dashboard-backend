import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  StockReviewAuditLogEntry,
  StockReviewAuditLogPort,
  StockReviewAuditLogRecordDTO,
} from "../../domain/ports/out/stock-review-audit-log.port.js";

export class FakeStockReviewAuditLog implements StockReviewAuditLogPort {
  readonly entries: StockReviewAuditLogEntry[] = [];

  async record(entry: StockReviewAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findByEntityId(_organizationId: OrganizationId, entityId: string): Promise<StockReviewAuditLogRecordDTO[]> {
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
