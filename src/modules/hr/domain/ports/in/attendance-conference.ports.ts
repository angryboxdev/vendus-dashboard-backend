import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AttendanceCorrectionType } from "../out/attendance-correction-repository.port.js";

export type AttendanceStateDTO = "REGULAR" | "PRESENTE" | "CONCLUIDO" | "PARCIAL" | "AUSENTE" | "EM_ABERTO" | "CONFLITO";

export interface AttendancePeriodDTO {
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
}

export interface AttendanceIssueRowDTO {
  shiftId: string | null;
  attendanceId: string | null;
  employeeId: string;
  employeeName: string;
  workDate: string;
  locationId: string | null;
  locationName: string | null;
  endsNextDay: boolean;
  periods: AttendancePeriodDTO[];
  state: AttendanceStateDTO;
  occurrenceLabel: string;
  plannedMinutes: number;
  actualMinutes: number;
}

export interface AttendanceIssuesKpisDTO {
  pendingCount: number;
  lateCount: number;
  actualMinutesTotal: number;
  plannedMinutesTotal: number;
  balanceMinutes: number;
}

export interface ListAttendanceIssuesCommand {
  organizationId: OrganizationId;
  year: number;
  month: number;
  locationId?: string;
}

export interface ListAttendanceIssuesResultDTO {
  items: AttendanceIssueRowDTO[];
  kpis: AttendanceIssuesKpisDTO;
}

export interface ListAttendanceIssuesPort {
  execute(command: ListAttendanceIssuesCommand): Promise<ListAttendanceIssuesResultDTO>;
}

export interface AttendanceCorrectionHistoryEntryDTO {
  id: string;
  createdAt: string;
  correctionType: AttendanceCorrectionType;
  original: { status: string | null; actualStartTime: string | null; actualEndTime: string | null } | null;
  corrected: { status: string | null; actualStartTime: string | null; actualEndTime: string | null } | null;
  reason: string;
  notes: string | null;
  actor: string;
}

export interface AttendanceIssueDetailDTO extends AttendanceIssueRowDTO {
  diffMinutes: number;
  corrections: AttendanceCorrectionHistoryEntryDTO[];
}

export interface GetAttendanceIssueDetailCommand {
  organizationId: OrganizationId;
  /** A linha já é conhecida da lista — evita variar o intervalo de busca. */
  workDate: string;
  /** Identifica a ocorrência — `shiftId` para turnos planeados, `attendanceId` para presença sem escala. */
  shiftId?: string;
  attendanceId?: string;
}

export interface GetAttendanceIssueDetailPort {
  execute(command: GetAttendanceIssueDetailCommand): Promise<AttendanceIssueDetailDTO | null>;
}

export interface CorrectShiftAttendanceCommand {
  organizationId: OrganizationId;
  actor: string;
  workShiftId: string | null;
  attendanceId: string | null;
  employeeId: string;
  workDate: string;
  locationId: string;
  correctionType: AttendanceCorrectionType;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  lateMinutes?: number | null;
  reason: string;
  notes?: string | null;
}

export interface CorrectShiftAttendancePort {
  execute(command: CorrectShiftAttendanceCommand): Promise<AttendanceIssueDetailDTO | null>;
}

// ── Fecho mensal ─────────────────────────────────────────────────────────

export interface MonthlyClosureStatusDTO {
  year: number;
  month: number;
  status: "open" | "closed";
  closedBy: string | null;
  closedAt: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  blockerCount: number;
  plannedShiftsCount: number;
  regularShiftsCount: number;
  lateCount: number;
  leaveDaysCount: number;
}

export interface GetMonthlyClosureStatusCommand {
  organizationId: OrganizationId;
  year: number;
  month: number;
}

export interface GetMonthlyClosureStatusPort {
  execute(command: GetMonthlyClosureStatusCommand): Promise<MonthlyClosureStatusDTO>;
}

export interface CloseMonthlyPeriodCommand {
  organizationId: OrganizationId;
  actor: string;
  year: number;
  month: number;
}

export interface CloseMonthlyPeriodPort {
  execute(command: CloseMonthlyPeriodCommand): Promise<MonthlyClosureStatusDTO>;
}

export interface ReopenMonthlyPeriodCommand {
  organizationId: OrganizationId;
  actor: string;
  year: number;
  month: number;
  reason: string;
}

export interface ReopenMonthlyPeriodPort {
  execute(command: ReopenMonthlyPeriodCommand): Promise<MonthlyClosureStatusDTO>;
}
