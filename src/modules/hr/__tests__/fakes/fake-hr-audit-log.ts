import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { HrAuditLogEntry, HrAuditLogPort, HrAuditLogRecordDTO } from "../../domain/ports/out/hr-audit-log.port.js";

export class FakeHrAuditLog implements HrAuditLogPort {
  readonly entries: HrAuditLogEntry[] = [];

  async record(entry: HrAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async findByEmployeeId(
    _organizationId: OrganizationId,
    employeeId: string,
    pagination: { page: number; pageSize: number },
  ): Promise<{ items: HrAuditLogRecordDTO[]; total: number }> {
    const all = this.entries
      .filter((e) => e.employeeId === employeeId)
      .map((e, i) => ({
        id: `audit-${i}`,
        createdAt: new Date().toISOString(),
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        actor: e.actor,
        description: e.description,
        before: e.before,
        after: e.after,
        correlationId: e.correlationId,
      }))
      .reverse();
    const start = (pagination.page - 1) * pagination.pageSize;
    return { items: all.slice(start, start + pagination.pageSize), total: all.length };
  }
}
