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
  /** AGENDADO|EM_TOLERANCIA|PRESENTE|ATRASADO|AUSENTE|INTERVALO|FINALIZADO|FERIAS|BAIXA|FOLGA|CONFLITO — ver `OperationDisplayState`. */
  state: string;
  /** Texto contextual — nunca repete o que `state` já diz (ex: "Entrada 12:18 · atraso 18 min", "Sem entrada", "Até 30/09"). */
  situation: string;
  /** Linha secundária de alerta (ex: "1º turno sem entrada") — continua visível mesmo quando já não afeta `state`/`situation` atuais. Null = sem inconsistência a sinalizar. */
  situationWarning: string | null;
  /** 1 ou 2 partes por turno do dia (repartido inclui as 2; mais de 1 turno no mesmo dia soma todas, ordenadas); null quando não há turno hoje (ex: só ausência). */
  shiftToday: string[] | null;
  locationId: string | null;
  locationName: string | null;
  /** Turno "por conferir" a que esta linha se refere — permite abrir a conferência diretamente a partir da Visão Geral. Null quando não há turno associado ou não precisa de conferência. */
  reviewShiftId: string | null;
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
  locationName: string | null;
}

export interface GetShiftToReviewCommand {
  organizationId: OrganizationId;
  shiftId: string;
}

/** Busca 1 turno "por conferir" pelo id — permite abrir a conferência diretamente (ex: a partir da Visão Geral) sem primeiro carregar a lista paginada inteira. Null quando o turno não existe ou já não precisa de conferência. */
export interface GetShiftToReviewPort {
  execute(command: GetShiftToReviewCommand): Promise<ShiftToReviewDTO | null>;
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
