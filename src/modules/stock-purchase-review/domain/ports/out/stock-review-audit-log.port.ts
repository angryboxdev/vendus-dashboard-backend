import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type StockReviewAuditEntityType = "stock_purchase_review";

export interface StockReviewAuditLogEntry {
  organizationId: OrganizationId;
  actor: string;
  entityType: StockReviewAuditEntityType;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export interface StockReviewAuditLogRecordDTO {
  id: string;
  createdAt: string;
  entityType: StockReviewAuditEntityType;
  entityId: string;
  action: string;
  actor: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** Mirror de `AccountingAuditLogPort` — fire-and-forget, uma falha nunca propaga para o use case chamador. */
export interface StockReviewAuditLogPort {
  record(entry: StockReviewAuditLogEntry): Promise<void>;
  findByEntityId(organizationId: OrganizationId, entityId: string): Promise<StockReviewAuditLogRecordDTO[]>;
}
