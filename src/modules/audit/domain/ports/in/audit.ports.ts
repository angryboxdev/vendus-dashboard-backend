import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AuditEvent, AuditEventInput, AuditQuery } from "../../entities/audit-event.js";

/** Usado pelos outros módulos (via composition root) para registar. */
export interface RecordAuditEventPort {
  record(orgId: OrganizationId, event: AuditEventInput): Promise<void>;
}

export interface AuditQueryPorts {
  list(orgId: OrganizationId, q: Partial<AuditQuery>): Promise<AuditEvent[]>;
  verify(orgId: OrganizationId): Promise<{ intact: boolean; brokenAtSeq: number | null }>;
}
