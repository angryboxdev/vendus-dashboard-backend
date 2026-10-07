import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { LeaveWritePort, NewAbsence } from "../../domain/ports/out/leave-write.port.js";

/** Escrita de ausências no padrão novo (RH 2.0 T4) — mesma tabela do legacy, sempre `status = 'active'`. */
export class SupabaseLeaveWriteAdapter implements LeaveWritePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async createAbsence(organizationId: OrganizationId, a: NewAbsence): Promise<string> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_leave_requests")
      .insert({
        employee_id: a.employeeId,
        type: a.type,
        start_date: a.startDate,
        end_date: a.endDate,
        working_days: a.workingDays,
        notes: a.notes,
        status: "active",
        source: a.source,
        portal_request_id: a.portalRequestId,
        created_by: a.createdBy,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return (data as unknown as { id: string }).id;
  }
}
