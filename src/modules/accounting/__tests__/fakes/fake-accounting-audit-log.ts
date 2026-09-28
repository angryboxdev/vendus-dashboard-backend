import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  AccountingAuditLogEntry,
  AccountingAuditLogPort,
  AccountingAuditLogRecordDTO,
} from "../../domain/ports/out/accounting-audit-log.port.js";

export class FakeAccountingAuditLog implements AccountingAuditLogPort {
  readonly entries: AccountingAuditLogEntry[] = [];

  async record(entry: AccountingAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findByEntityId(_organizationId: OrganizationId, entityId: string): Promise<AccountingAuditLogRecordDTO[]> {
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
