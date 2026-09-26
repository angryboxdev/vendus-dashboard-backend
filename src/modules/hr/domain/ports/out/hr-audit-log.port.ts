import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type HrAuditEntityType = "employee" | "employee_document";

export interface HrAuditLogEntry {
  organizationId: OrganizationId;
  /** Email/sub de quem executou a ação — nunca omitido (corrige a lacuna do audit log legacy, onde `actor` nunca era preenchido). */
  actor: string;
  entityType: HrAuditEntityType;
  entityId: string;
  employeeId: string;
  action: string;
  description: string;
  before?: unknown;
  after?: unknown;
  correlationId: string;
}

export interface HrAuditLogRecordDTO {
  id: string;
  createdAt: string;
  entityType: HrAuditEntityType;
  entityId: string;
  action: string;
  actor: string;
  description: string;
  before: unknown;
  after: unknown;
  correlationId: string | null;
}

export interface HrAuditLogPort {
  /**
   * Fire-and-forget: uma falha ao gravar auditoria nunca deve propagar para o
   * fluxo principal do use case (mesmo comportamento do `hrAuditService`
   * legacy — ver README).
   */
  record(entry: HrAuditLogEntry): Promise<void>;
  findByEmployeeId(
    organizationId: OrganizationId,
    employeeId: string,
    pagination: { page: number; pageSize: number },
  ): Promise<{ items: HrAuditLogRecordDTO[]; total: number }>;
}
