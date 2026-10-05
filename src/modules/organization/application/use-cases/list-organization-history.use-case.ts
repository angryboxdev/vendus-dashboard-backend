import type {
  ListOrganizationHistoryPort,
  ListOrganizationHistoryQuery,
} from "../../domain/ports/in/organization-profile.ports.js";
import type {
  OrganizationAuditLogPort,
  OrganizationAuditLogRecordDTO,
} from "../../domain/ports/out/organization-audit-log.port.js";

/** A `Organization` é a própria fronteira de tenant — o id da entidade auditada é o próprio `organizationId`. */
export class ListOrganizationHistoryUseCase implements ListOrganizationHistoryPort {
  constructor(private readonly auditLog: OrganizationAuditLogPort) {}

  async execute(query: ListOrganizationHistoryQuery): Promise<OrganizationAuditLogRecordDTO[]> {
    return this.auditLog.findByEntityId(query.organizationId, query.organizationId);
  }
}
