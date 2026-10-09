import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PortalRequestKind } from "../../entities/portal-request.js";
import type { LeaveType } from "../out/leave-read.port.js";
import type { AttendanceIssueDetailDTO } from "./attendance-conference.ports.js";

/** A ocorrência de Assiduidade em causa (mesmas chaves da correção). */
export interface OccurrenceRef {
  workShiftId: string | null;
  attendanceId: string | null;
  employeeId: string;
  workDate: string;
  locationId: string;
}

export interface AbsenceCandidateDTO {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  duration: string;
}

export interface ConfirmAbsencePreviewDTO {
  /** single → vincula; multiple → o gestor escolhe; pending_request → rever o pedido; none → criar. */
  match: "single" | "multiple" | "pending_request" | "none";
  candidates: AbsenceCandidateDTO[];
  pendingRequest: { id: string; kind: PortalRequestKind; startDate: string; endDate: string; reasonLabel: string; reasonText: string | null } | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  endsNextDay: boolean;
}

export interface PreviewConfirmAbsencePort {
  execute(command: OccurrenceRef & { organizationId: OrganizationId }): Promise<ConfirmAbsencePreviewDTO>;
}

export interface ConfirmAbsenceCommand extends OccurrenceRef {
  organizationId: OrganizationId;
  actor: string;
  /** Quando há várias compatíveis: a escolhida pelo gestor. */
  absenceId?: string;
  /** Quando não há nenhuma: os dados para criar. */
  newAbsence?: { type: LeaveType; startTime?: string | null; endTime?: string | null; notes?: string | null };
}

export interface ConfirmAbsenceResultDTO {
  outcome: "linked" | "created";
  fullDay: boolean;
  absence: AbsenceCandidateDTO;
  issue: AttendanceIssueDetailDTO | null;
}

export interface ConfirmAbsencePort {
  execute(command: ConfirmAbsenceCommand): Promise<ConfirmAbsenceResultDTO>;
}
