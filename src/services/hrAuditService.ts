/**
 * Audit log service for the HR module.
 * logAudit() is fire-and-forget: it never throws, so a logging failure
 * never breaks the main operation.
 */

import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";

export type AuditEntityType = "employee" | "shift" | "payment" | "attendance";

export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "status_changed"
  | "attendance_registered"
  | "attendance_updated"
  | "attendance_deleted"
  | "contract_changed"
  | "schedule_updated"
  | "pin_set"
  | "kiosk_checkin"
  | "kiosk_checkout";

export interface HrAuditLog {
  id: string;
  createdAt: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actor: string | null;
  description: string;
  payloadBefore: unknown;
  payloadAfter: unknown;
  employeeId: string | null;
}

interface LogAuditParams {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  description: string;
  employeeId?: string;
  actor?: string;
  payloadBefore?: unknown;
  payloadAfter?: unknown;
}

type AuditRow = {
  id: string;
  created_at: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string | null;
  description: string;
  payload_before: unknown;
  payload_after: unknown;
  employee_id: string | null;
};

function rowToLog(row: AuditRow): HrAuditLog {
  return {
    id: row.id,
    createdAt: row.created_at,
    entityType: row.entity_type as AuditEntityType,
    entityId: row.entity_id,
    action: row.action as AuditAction,
    actor: row.actor,
    description: row.description,
    payloadBefore: row.payload_before ?? null,
    payloadAfter: row.payload_after ?? null,
    employeeId: row.employee_id,
  };
}

/** Write an audit entry. Never throws — errors are logged to stderr only. */
export async function logAudit(organizationId: OrganizationId, params: LogAuditParams): Promise<void> {
  try {
    await createScopedQuery(organizationId)
      .table("hr_audit_logs")
      .insert({
        entity_type: params.entityType,
        entity_id: params.entityId,
        action: params.action,
        description: params.description,
        employee_id: params.employeeId ?? null,
        actor: params.actor ?? null,
        payload_before: params.payloadBefore ?? null,
        payload_after: params.payloadAfter ?? null,
      });
  } catch {
    console.error("[audit] failed to write log:", params.description);
  }
}

/** Paginated audit log query. */
export async function listAuditLogs(
  organizationId: OrganizationId,
  options: {
    employeeId?: string;
    entityType?: AuditEntityType;
    action?: AuditAction;
    limit: number;
    offset: number;
  },
): Promise<{ logs: HrAuditLog[]; total: number }> {
  let q = createScopedQuery(organizationId)
    .table("hr_audit_logs")
    .select(
      "id, created_at, entity_type, entity_id, action, actor, description, payload_before, payload_after, employee_id",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(options.offset, options.offset + options.limit - 1);

  if (options.employeeId) q = q.eq("employee_id", options.employeeId);
  if (options.entityType) q = q.eq("entity_type", options.entityType);
  if (options.action) q = q.eq("action", options.action);

  const { data, error, count } = await q;
  if (error) throw new Error(`Audit logs: ${error.message}`);

  return {
    logs: ((data ?? []) as unknown as AuditRow[]).map(rowToLog),
    total: count ?? 0,
  };
}
