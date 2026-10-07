import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AttendanceCorrectionType } from "../out/attendance-correction-repository.port.js";
import type { AttendanceOccurrenceKind } from "../../services/attendance-occurrence.service.js";

export type AttendanceStateDTO = "REGULAR" | "PRESENTE" | "CONCLUIDO" | "PARCIAL" | "AUSENTE" | "EM_ABERTO" | "CONFLITO";

export interface AttendancePeriodDTO {
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
}

/** Fase 2.1 — classificação automática por tolerância (paralela ao `state`/`occurrenceLabel` manuais). */
export type AttendanceOccurrenceKindDTO = AttendanceOccurrenceKind;

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
  /** Fase 2.1 */
  occurrenceKind: AttendanceOccurrenceKindDTO;
  /** Fase 2.1 — diferença real (minutos, com sinal) entre planeado e registado; `null` quando não aplicável (ex.: sem entrada). */
  diffMinutes: number | null;
  /** Fase 2.1 — "pending" até existir ≥1 correção para este turno/colaborador+dia; "conferred" depois. */
  reviewStatus: "pending" | "conferred";
}

/**
 * Task "Assiduidade — Conferência, Por Colaborador e Horas & Saldos"
 * (secção 3): a Conferência é uma FILA de trabalho por fazer, não um
 * resumo do período — todos os KPIs contam só `reviewStatus: "pending"`.
 * Horas planeadas/realizadas/Saldo saíram daqui (secção 3, explícito) —
 * vivem em "Por colaborador"/"Horas & saldos" (`MonthlyAttendanceSummaryResultDTO`).
 */
export interface AttendanceIssuesKpisDTO {
  pendingCount: number;
  /** Dias de trabalho (colaborador+data), só pendentes, com ≥1 atraso acima da tolerância. */
  lateDaysCount: number;
  /** Soma do atraso real (minutos) de todas as entradas pendentes fora da tolerância. */
  lateMinutesTotal: number;
  /** Nº de ocorrências de atraso pendentes (não confundir com `lateDaysCount`). */
  lateOccurrencesCount: number;
  /** "Possíveis ausências" — pendentes com `occurrenceKind: "absence"` (ainda não confirmadas/justificadas pelo gestor). */
  possibleAbsencesCount: number;
  /** "Sem saída" — pendentes com `occurrenceKind: "no_exit"`. */
  noExitCount: number;
  /** "Conflitos" — pendentes com `occurrenceKind: "conflict"`. */
  conflictsCount: number;
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
  /** "Confirmar ausência": a ausência a que a ocorrência fica vinculada. */
  absenceId?: string | null;
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
