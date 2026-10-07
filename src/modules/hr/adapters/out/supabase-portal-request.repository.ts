import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { PortalRequest, type PortalRequestKind, type PortalRequestProps } from "../../domain/entities/portal-request.js";
import type { PortalRequestRepositoryPort } from "../../domain/ports/out/portal-request-repository.port.js";

const SELECT =
  "id, employee_id, kind, status, work_shift_id, start_date, end_date, reason_code, reason_text, attachment_path, attachment_name, attachment_mime, decided_by, decided_at, decision_note, leave_request_id, created_at";

interface Row {
  id: string;
  employee_id: string;
  kind: PortalRequestKind;
  status: PortalRequestProps["status"];
  work_shift_id: string | null;
  start_date: string;
  end_date: string;
  reason_code: string;
  reason_text: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  leave_request_id: string | null;
  created_at: string;
}

function toEntity(r: Row): PortalRequest {
  return PortalRequest.reconstitute({
    id: r.id,
    employeeId: r.employee_id,
    kind: r.kind,
    status: r.status,
    workShiftId: r.work_shift_id,
    startDate: r.start_date,
    endDate: r.end_date,
    reasonCode: r.reason_code,
    reasonText: r.reason_text,
    attachment: r.attachment_path ? { path: r.attachment_path, name: r.attachment_name ?? "anexo", mime: r.attachment_mime ?? "application/octet-stream" } : null,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    leaveRequestId: r.leave_request_id,
    createdAt: r.created_at,
  });
}

function toRow(p: PortalRequestProps): Record<string, unknown> {
  return {
    id: p.id,
    employee_id: p.employeeId,
    kind: p.kind,
    status: p.status,
    work_shift_id: p.workShiftId,
    start_date: p.startDate,
    end_date: p.endDate,
    reason_code: p.reasonCode,
    reason_text: p.reasonText,
    attachment_path: p.attachment?.path ?? null,
    attachment_name: p.attachment?.name ?? null,
    attachment_mime: p.attachment?.mime ?? null,
    decided_by: p.decidedBy,
    decided_at: p.decidedAt,
    decision_note: p.decisionNote,
    leave_request_id: p.leaveRequestId,
  };
}

/** `hr_portal_requests` (ticket 12). */
export class SupabasePortalRequestRepository implements PortalRequestRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async create(organizationId: OrganizationId, request: PortalRequest): Promise<PortalRequest> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_portal_requests").insert(toRow(request.toProps())).select(SELECT).single();
    if (error) throw new Error(error.message);
    return toEntity(data as unknown as Row);
  }

  async update(organizationId: OrganizationId, request: PortalRequest): Promise<PortalRequest> {
    const { id, ...patch } = toRow(request.toProps());
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_portal_requests")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id as string)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return toEntity(data as unknown as Row);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<PortalRequest | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_portal_requests").select(SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as Row) : null;
  }

  async findForEmployee(organizationId: OrganizationId, employeeId: string, limit: number): Promise<PortalRequest[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_portal_requests")
      .select(SELECT)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toEntity);
  }

  async findOverlapping(organizationId: OrganizationId, from: string, to: string): Promise<PortalRequest[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_portal_requests")
      .select(SELECT)
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toEntity);
  }

  async findPending(organizationId: OrganizationId, kinds: PortalRequestKind[]): Promise<PortalRequest[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_portal_requests")
      .select(SELECT)
      .eq("status", "pending")
      .in("kind", kinds)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toEntity);
  }
}
