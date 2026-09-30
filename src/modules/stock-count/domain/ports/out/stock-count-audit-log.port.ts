import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type StockCountAuditEntityType = "stock_count_session" | "stock_count_line" | "stock_count_zone";

export interface StockCountAuditLogEntry {
  organizationId: OrganizationId;
  actor: string;
  entityType: StockCountAuditEntityType;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export interface StockCountAuditLogRecordDTO {
  id: string;
  createdAt: string;
  entityType: StockCountAuditEntityType;
  entityId: string;
  action: string;
  actor: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** Mirror de `StockReviewAuditLogPort`/`HrAuditLogPort` — fire-and-forget, uma falha nunca propaga para o use case chamador. */
export interface StockCountAuditLogPort {
  record(entry: StockCountAuditLogEntry): Promise<void>;
  findByEntityId(organizationId: OrganizationId, entityId: string): Promise<StockCountAuditLogRecordDTO[]>;
}
