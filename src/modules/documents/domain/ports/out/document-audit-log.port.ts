import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type DocumentAuditEntityType = "company_document" | "document_category" | "employee_document";

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
 * Auditoria dos documentos (D3: tabela própria do módulo,
 * `document_audit_logs`): Empresa, categorias e, desde a fase 1 da
 * ADR-0040, os documentos de colaborador (o RH antigo gravava-os em
 * `hr_audit_logs`; o Novo RH começa sem esse histórico — decisão do
 * utilizador). Fire-and-forget, como os restantes.
 */
export interface DocumentAuditLogPort {
  record(entry: DocumentAuditLogEntry): Promise<void>;
}
