import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AttendanceRulesValues } from "../../entities/attendance-rules.js";

export interface AttendanceRulesConfigDTO extends AttendanceRulesValues {
  effectiveFrom: string;
  updatedBy: string;
  updatedAt: string;
}

export interface GetAttendanceRulesCommand {
  organizationId: OrganizationId;
}

export interface GetAttendanceRulesPort {
  execute(command: GetAttendanceRulesCommand): Promise<AttendanceRulesConfigDTO>;
}

export interface UpdateAttendanceRulesCommand extends AttendanceRulesValues {
  organizationId: OrganizationId;
  actor: string;
}

export interface UpdateAttendanceRulesPort {
  execute(command: UpdateAttendanceRulesCommand): Promise<AttendanceRulesConfigDTO>;
}

/** Fase 2.1 — histórico por campo (task, secção 4/17): "valor anterior/novo, vigência, quem alterou, quando". */
export interface AttendanceRuleChangeEntryDTO {
  id: string;
  field: keyof AttendanceRulesValues;
  previousValue: number;
  newValue: number;
  effectiveFrom: string;
  changedBy: string;
  changedAt: string;
}

export interface ListAttendanceRuleChangesCommand {
  organizationId: OrganizationId;
}

export interface ListAttendanceRuleChangesPort {
  execute(command: ListAttendanceRuleChangesCommand): Promise<AttendanceRuleChangeEntryDTO[]>;
}
