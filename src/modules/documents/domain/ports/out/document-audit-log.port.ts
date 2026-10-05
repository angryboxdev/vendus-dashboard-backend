import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type DocumentAuditEntityType = "company_document" | "document_category";

export interface DocumentAuditLogEntry {
  organizationId: OrganizationId;
  actor: string;
  entityType: DocumentAuditEntityType;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * Auditoria dos documentos da Empresa (D3: tabela própria do módulo,
 * `document_audit_logs`). Os documentos de colaborador continuam a ser
 * auditados no histórico do colaborador (`hr_audit_logs`, módulo `hr`).
 * Fire-and-forget, como os restantes.
 */
export interface DocumentAuditLogPort {
  record(entry: DocumentAuditLogEntry): Promise<void>;
}
