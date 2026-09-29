import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { ActiveLeave, ActiveLeaveRange, LeaveReadPort, LeaveType } from "../../domain/ports/out/leave-read.port.js";

interface LeaveRow {
  employee_id: string;
  type: string;
  start_date?: string;
  end_date?: string;
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

  async findActiveInRange(organizationId: OrganizationId, from: string, to: string): Promise<ActiveLeaveRange[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_leave_requests")
      .select("employee_id, type, start_date, end_date")
      .lte("start_date", to)
      .gte("end_date", from);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as LeaveRow[]).map((row) => ({
      employeeId: row.employee_id,
      type: row.type as LeaveType,
      startDate: row.start_date!,
      endDate: row.end_date!,
    }));
  }
}
