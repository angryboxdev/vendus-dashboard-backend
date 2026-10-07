import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type HrAuditEntityType =
  | "employee"
  | "employee_document"
  | "work_shift"
  | "base_schedule_template"
  | "shift_rotation"
  // Fase 2 — nomes distintos do vocabulário legacy ("attendance", sem "_correction") para não colidir semanticamente na mesma tabela partilhada `hr_audit_logs`.
  | "attendance_correction"
  | "monthly_closure"
  // Fase 2.1
  | "attendance_rules"
  // Base Organizacional — Cargos (ticket 07): entidade da organização, sem colaborador associado.
  | "position"
  // RH 2.0 — Modelos de turno (entidade da organização, sem colaborador associado).
  | "shift_template"
  // RH 2.0 — Automatizações (entidade da organização).
  | "shift_automation"
  // Portal do Colaborador — acesso (conta ligada à ficha) e picagens pelo Portal.
  | "portal_access"
  | "attendance_punch"
  // Portal do Colaborador — pedidos (justificar falta / pedir folga).
  | "portal_request";

export interface HrAuditLogEntry {
  organizationId: OrganizationId;
  /** Email/sub de quem executou a ação — nunca omitido (corrige a lacuna do audit log legacy, onde `actor` nunca era preenchido). */
  actor: string;
  entityType: HrAuditEntityType;
  entityId: string;
  /** Omitido só para entidades da organização sem colaborador (ex.: `position`) — `hr_audit_logs.employee_id` é nullable. */
  employeeId?: string;
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
  /** Todos os registos de uma operação (mesmo `correlationId`) — usado pelo "Desfazer". */
  findByCorrelationId(organizationId: OrganizationId, correlationId: string): Promise<HrAuditLogRecordDTO[]>;
}
