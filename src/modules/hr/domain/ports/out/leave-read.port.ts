import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type LeaveType = "vacation" | "sick_leave" | "justified" | "unjustified" | "compensatory";

export interface ActiveLeave {
  employeeId: string;
  type: LeaveType;
}

/**
 * Lê `hr_leave_requests` (módulo legacy) diretamente — padrão D10. Nota:
 * `HrLeaveRequest` não tem campo de estado (pending/approved/rejected) —
 * uma ausência aqui é um facto já registado, não um pedido por aprovar
 * (ver README, "Férias por aprovar" foi omitido por não haver essa fonte).
 */
export interface ActiveLeaveRange extends ActiveLeave {
  startDate: string;
  endDate: string;
}

export interface LeaveReadPort {
  /** Ausências cuja janela [startDate, endDate] cobre `dateYmd`. */
  findActiveOnDate(organizationId: OrganizationId, dateYmd: string): Promise<ActiveLeave[]>;
  /** Ausências cuja janela [startDate, endDate] intersecta [from, to] — para varrer uma semana/mês de uma vez (RH-03). */
  findActiveInRange(organizationId: OrganizationId, from: string, to: string): Promise<ActiveLeaveRange[]>;
}
