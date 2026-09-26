import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { ActiveLeave, LeaveReadPort, LeaveType } from "../../domain/ports/out/leave-read.port.js";

interface LeaveRow {
  employee_id: string;
  type: string;
}

export class SupabaseLeaveReadAdapter implements LeaveReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findActiveOnDate(organizationId: OrganizationId, dateYmd: string): Promise<ActiveLeave[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_leave_requests")
      .select("employee_id, type")
      .lte("start_date", dateYmd)
      .gte("end_date", dateYmd);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as LeaveRow[]).map((row) => ({
      employeeId: row.employee_id,
      type: row.type as LeaveType,
    }));
  }
}
