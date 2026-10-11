import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AuditEvent, AuditEventInput, AuditQuery, AuditRequestContext } from "../../entities/audit-event.js";

export interface AuditStorePort {
  append(orgId: OrganizationId, event: AuditEventInput & AuditRequestContext): Promise<AuditEvent>;
  query(orgId: OrganizationId, q: AuditQuery): Promise<AuditEvent[]>;
  /** Primeiro seq com a cadeia quebrada; null = íntegra. */
  verify(orgId: OrganizationId): Promise<number | null>;
}

/** Contexto do pedido em curso (IP, dispositivo, correlação). */
export interface AuditContextPort {
  current(): AuditRequestContext;
}
