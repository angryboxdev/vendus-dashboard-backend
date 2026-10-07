import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { LeaveType } from "./leave-read.port.js";

/** Ausência nova (padrão novo, RH 2.0 T4) — `hr_leave_requests`, nunca apagada fisicamente. */
export interface NewAbsence {
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  workingDays: number;
  notes: string | null;
  source: "hr" | "portal";
  portalRequestId: string | null;
  createdBy: string;
}

export interface LeaveWritePort {
  /** Devolve o id da ausência criada. */
  createAbsence(organizationId: OrganizationId, absence: NewAbsence): Promise<string>;
}
