import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type ShiftAttendanceStatus = "worked_as_planned" | "late" | "left_early" | "cancelled";

/**
 * Um turno + a sua conferência (se existir), lido diretamente de
 * `hr_work_shifts`/`hr_shift_attendance` (módulo legacy) — padrão D10, sem
 * importar `hrShiftService.ts`/`hrShiftAttendanceService.ts`. Horas em
 * "HH:mm" (mesma convenção da API legacy — ver `src/utils/hrTime.ts`).
 */
export interface ShiftOccurrence {
  shiftId: string;
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  /** Turno noturno (atravessa a meia-noite) — `endTime` refere-se ao dia seguinte a `workDate`. Nunca combinado com `secondStartTime` (regra V1 de `WorkShift`). */
  endsNextDay: boolean;
  /** 2º período de um turno repartido — null = turno direto (1 período). */
  secondStartTime: string | null;
  secondEndTime: string | null;
  locationId: string;
  attendanceStatus: ShiftAttendanceStatus | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  lateMinutes: number | null;
}

export interface ShiftAttendanceReadPort {
  findShiftsInRange(
    organizationId: OrganizationId,
    range: { from: string; to: string; locationId?: string },
  ): Promise<ShiftOccurrence[]>;
}
