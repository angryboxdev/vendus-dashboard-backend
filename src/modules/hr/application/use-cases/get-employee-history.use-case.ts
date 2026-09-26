import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  GetEmployeeHistoryCommand,
  GetEmployeeHistoryPort,
  EmployeeHistoryEntryDTO,
} from "../../domain/ports/in/employee.ports.js";

export class GetEmployeeHistoryUseCase implements GetEmployeeHistoryPort {
  constructor(private readonly auditLog: HrAuditLogPort) {}

  async execute(
    command: GetEmployeeHistoryCommand,
  ): Promise<{ items: EmployeeHistoryEntryDTO[]; total: number }> {
    const { items, total } = await this.auditLog.findByEmployeeId(command.organizationId, command.id, {
      page: command.page,
      pageSize: command.pageSize,
    });
    return {
      items: items.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        entityType: entry.entityType,
        action: entry.action,
        actor: entry.actor,
        description: entry.description,
      })),
      total,
    };
  }
}
