import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ActiveLeave, LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";

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
}
