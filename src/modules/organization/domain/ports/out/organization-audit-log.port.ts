import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type OrganizationAuditEntityType = "organization";

export interface OrganizationAuditLogEntry {
  organizationId: OrganizationId;
  actor: string;
  entityType: OrganizationAuditEntityType;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export interface OrganizationAuditLogRecordDTO {
  id: string;
  createdAt: string;
  entityType: OrganizationAuditEntityType;
  entityId: string;
  action: string;
  actor: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** Mirror de `StockCountAuditLogPort`/`HrAuditLogPort` — fire-and-forget, uma falha nunca propaga para o use case chamador. */
export interface OrganizationAuditLogPort {
  record(entry: OrganizationAuditLogEntry): Promise<void>;
  findByEntityId(organizationId: OrganizationId, entityId: string): Promise<OrganizationAuditLogRecordDTO[]>;
}
