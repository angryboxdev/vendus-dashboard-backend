import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Só `AccountingDocument` nesta ronda — `invoices` mantém o seu próprio histórico, separado. */
export type AccountingAuditEntityType = "accounting_document";

export interface AccountingAuditLogEntry {
  organizationId: OrganizationId;
  /** Email/sub de quem executou a ação — nunca omitido. */
  actor: string;
  entityType: AccountingAuditEntityType;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export interface AccountingAuditLogRecordDTO {
  id: string;
  createdAt: string;
  entityType: AccountingAuditEntityType;
  entityId: string;
  action: string;
  actor: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** Mirror de `HrAuditLogPort` (módulo `hr`) — mesmo formato, tabela própria. */
export interface AccountingAuditLogPort {
  /**
   * Fire-and-forget: uma falha ao gravar auditoria nunca deve propagar para
   * o fluxo principal do use case.
   */
  record(entry: AccountingAuditLogEntry): Promise<void>;
  findByEntityId(organizationId: OrganizationId, entityId: string): Promise<AccountingAuditLogRecordDTO[]>;
}
