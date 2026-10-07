import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ActiveLeave, ActiveLeaveRange, EmployeeLeaveEntry, LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";

export class FakeLeaveReadAdapter implements LeaveReadPort {
  private readonly leaves: Array<{ organizationId: string; startDate: string; endDate: string; leave: ActiveLeave }> = [];

  seed(organizationId: OrganizationId, startDate: string, endDate: string, leave: ActiveLeave): void {
    this.leaves.push({ organizationId: String(organizationId), startDate, endDate, leave });
  }

  async findActiveOnDate(organizationId: OrganizationId, dateYmd: string): Promise<ActiveLeave[]> {
    return this.leaves
      .filter((l) => l.organizationId === String(organizationId) && l.startDate <= dateYmd && l.endDate >= dateYmd)
      .map((l) => l.leave);
  }

  async findActiveInRange(organizationId: OrganizationId, from: string, to: string): Promise<ActiveLeaveRange[]> {
    return this.leaves
      .filter((l) => l.organizationId === String(organizationId) && l.startDate <= to && l.endDate >= from)
      .map((l) => ({ ...l.leave, startDate: l.startDate, endDate: l.endDate }));
  }

  readonly entries: Array<{ organizationId: string; employeeId: string; entry: EmployeeLeaveEntry }> = [];

  async findForEmployee(organizationId: OrganizationId, employeeId: string, from: string, to: string): Promise<EmployeeLeaveEntry[]> {
    return this.entries
      .filter((e) => e.organizationId === String(organizationId) && e.employeeId === employeeId && e.entry.startDate <= to && e.entry.endDate >= from)
      .map((e) => e.entry);
  }
}
