import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AlertSeverity } from "../../services/overview-alert.service.js";

/** Um bloco falhou isoladamente na origem não derruba os outros (RH-01 secção 11/12) — nunca `0` como fallback técnico. */
export type BlockResult<T> = { status: "ok"; data: T } | { status: "unavailable"; reason: string };

export interface OverviewTeamDTO {
  activeEmployees: number;
  admissionsThisMonth: number;
  incompleteProfiles: number;
  documentsExpiringSoon: number;
}

export interface OverviewTodayDTO {
  scheduledCount: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
}

export interface OverviewPendingDTO {
  shiftsToReviewCount: number;
  unpaidPaymentsCount: number;
}

export interface OverviewAlertDTO {
  alertType: string;
  entityId: string;
  severity: AlertSeverity;
  occurredAt: string;
  employeeId: string;
  employeeName: string;
  message: string;
}

export interface OverviewOperationRowDTO {
  employeeId: string;
  employeeName: string;
  state: string;
  lastEvent: string;
  locationId: string | null;
}

export interface HrOverviewDTO {
  generatedAt: string;
  scope: { organizationId: string; locationId: string | null };
  team: BlockResult<OverviewTeamDTO>;
  today: BlockResult<OverviewTodayDTO>;
  pending: BlockResult<OverviewPendingDTO>;
  alerts: BlockResult<OverviewAlertDTO[]>;
  operation: BlockResult<OverviewOperationRowDTO[]>;
}

export interface GetHrOverviewCommand {
  organizationId: OrganizationId;
  locationId?: string;
}

export interface GetHrOverviewPort {
  execute(command: GetHrOverviewCommand): Promise<HrOverviewDTO>;
}

// ── Drill-down "Turnos por conferir" ─────────────────────────────────────

export type ReviewPriority = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

export interface ShiftToReviewDTO {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  plannedStartTime: string;
  plannedEndTime: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  exceptionLabel: string;
  priority: ReviewPriority;
  locationId: string;
}

export interface ListShiftsToReviewCommand {
  organizationId: OrganizationId;
  locationId?: string;
  priority?: ReviewPriority;
  search?: string;
  page: number;
  pageSize: number;
}

export interface ListShiftsToReviewResultDTO {
  items: ShiftToReviewDTO[];
  total: number;
  page: number;
  pageSize: number;
  countsByPriority: Record<ReviewPriority, number>;
}

export interface ListShiftsToReviewPort {
  execute(command: ListShiftsToReviewCommand): Promise<ListShiftsToReviewResultDTO>;
}
