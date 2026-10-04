import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type LocationAuditEntityType = "location";

export interface LocationAuditLogEntry {
  organizationId: OrganizationId;
  actor: string;
  entityType: LocationAuditEntityType;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export interface LocationAuditLogRecordDTO {
  id: string;
  createdAt: string;
  entityType: LocationAuditEntityType;
  entityId: string;
  action: string;
  actor: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** Mirror de `OrganizationAuditLogPort`/`StockCountAuditLogPort` — fire-and-forget. */
export interface LocationAuditLogPort {
  record(entry: LocationAuditLogEntry): Promise<void>;
  findByEntityId(organizationId: OrganizationId, entityId: string): Promise<LocationAuditLogRecordDTO[]>;
}
