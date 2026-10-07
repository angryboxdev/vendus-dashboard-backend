import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { LeaveWritePort, NewAbsence } from "../../domain/ports/out/leave-write.port.js";

export class FakeLeaveWrite implements LeaveWritePort {
  readonly created: Array<NewAbsence & { id: string }> = [];
  async createAbsence(_org: OrganizationId, absence: NewAbsence): Promise<string> {
    const id = `leave-${this.created.length + 1}`;
    this.created.push({ ...absence, id });
    return id;
  }
}
