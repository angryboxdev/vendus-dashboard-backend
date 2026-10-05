import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Task "Assiduidade — Conferência, Por Colaborador e Horas & Saldos":
 * `status` não tem fórmula definida na task (secção 17 só nomeia os 3
 * estados) — regra própria, documentada no README/`get-monthly-attendance-summary.use-case.ts`.
 */
export type AttendanceEmployeeStatusDTO = "pronto_para_fecho" | "pendencias" | "requer_atencao";

/** Fase 2.1 (+ evolução "Por colaborador") — 1 linha por colaborador com o agregado do mês. */
export interface MonthlyAttendanceSummaryRowDTO {
  employeeId: string;
  employeeName: string;
  /** Redesign do Fecho Mensal — subtítulo do nome na tabela geral. */
  /** Cargo do colaborador (o nome resolve-se pela lista de cargos). */
  positionId: string | null;
  /** Turnos planeados no mês (task, secção 17, coluna "Turnos"). */
  plannedShiftsCount: number;
  actualShiftsCount: number;
  pendingCount: number;
  plannedMinutes: number;
  actualMinutes: number;
  lateDaysCount: number;
  lateMinutesTotal: number;
  absenceDaysCount: number;
  /** `actualMinutes - planeado ATÉ HOJE` (nunca o total do mês — task, secção 12). */
  balanceMinutes: number;
  status: AttendanceEmployeeStatusDTO;
}

export interface MonthlyAttendanceSummaryKpisDTO {
  employeeCount: number;
  plannedShiftsCount: number;
  actualShiftsCount: number;
  lateDaysCount: number;
  lateMinutesTotal: number;
}

export interface MonthlyAttendanceSummaryResultDTO {
  kpis: MonthlyAttendanceSummaryKpisDTO;
  rows: MonthlyAttendanceSummaryRowDTO[];
}

export interface GetMonthlyAttendanceSummaryCommand {
  organizationId: OrganizationId;
  year: number;
  month: number;
  locationId?: string;
}

export interface GetMonthlyAttendanceSummaryPort {
  execute(command: GetMonthlyAttendanceSummaryCommand): Promise<MonthlyAttendanceSummaryResultDTO>;
}
