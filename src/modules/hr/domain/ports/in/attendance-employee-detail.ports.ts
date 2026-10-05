import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AttendanceIssueRowDTO } from "./attendance-conference.ports.js";

/**
 * Task "Assiduidade — Conferência, Por Colaborador e Horas & Saldos",
 * secção 18. "Confirmadas"/"confirmado" excluem linhas ainda
 * `reviewStatus: "pending"` (ainda não passaram pelo gestor) — nunca
 * turnos futuros (task, secção 12, "planeado até agora").
 */
export interface AttendanceEmployeeDetailKpisDTO {
  plannedShiftsCount: number;
  actualShiftsCount: number;
  pendingCount: number;
  lateDaysCount: number;
  lateMinutesTotal: number;
  absenceDaysCount: number;
  plannedMinutes: number;
  actualMinutesConfirmed: number;
  balanceConfirmed: number;
}

/**
 * Extrato diário completo (secção 19) — ao contrário da Conferência,
 * NUNCA pula os turnos "Regular"; cada linha reaproveita exatamente o
 * mesmo shape (e a mesma classificação) da Conferência, incluindo
 * `reviewStatus` para o filtro Todos/Pendentes/Atrasos/Ausências/
 * Conferidos (secção 19).
 */
export interface AttendanceEmployeeDetailResultDTO {
  employeeId: string;
  employeeName: string;
  /** Redesign do Fecho Mensal — subtítulo do cabeçalho da ficha individual. */
  /** Cargo do colaborador (o nome resolve-se pela lista de cargos). */
  positionId: string | null;
  kpis: AttendanceEmployeeDetailKpisDTO;
  rows: AttendanceIssueRowDTO[];
}

export interface GetAttendanceEmployeeDetailCommand {
  organizationId: OrganizationId;
  employeeId: string;
  year: number;
  month: number;
}

export interface GetAttendanceEmployeeDetailPort {
  execute(command: GetAttendanceEmployeeDetailCommand): Promise<AttendanceEmployeeDetailResultDTO | null>;
}
