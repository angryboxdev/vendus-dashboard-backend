import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface AttendanceSnapshotRow {
  id: string;
  workShiftId: string | null;
  employeeId: string;
  workDate: string;
  locationId: string;
  status: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  lateMinutes: number | null;
  registrationSource: string;
}

export interface UpsertAttendanceInput {
  /** Linha existente a atualizar — null cria uma nova (turno sem conferência ainda, ou presença sem escala nova). */
  attendanceId: string | null;
  workShiftId: string | null;
  employeeId: string;
  workDate: string;
  locationId: string;
  status: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  lateMinutes: number | null;
  notes: string | null;
  /** Preservado do valor existente quando a correção não mexe na origem — nunca apaga o rasto de `employee_qr` do kiosk. */
  registrationSource: string;
  registeredByEmployeeId: string | null;
}

/**
 * Write path único para `hr_shift_attendance` a partir do módulo novo
 * (Fase 2) — a rota legacy `PATCH /api/hr/shifts/:id/attendance`
 * continua a existir para o `ShiftReviewModal` já existente, mas a nova
 * Conferência usa só este port, sempre através de
 * `CorrectShiftAttendanceUseCase` (nunca upsert direto sem motivo/trilha).
 */
export interface AttendanceWritePort {
  findById(organizationId: OrganizationId, attendanceId: string): Promise<AttendanceSnapshotRow | null>;
  upsert(organizationId: OrganizationId, input: UpsertAttendanceInput): Promise<AttendanceSnapshotRow>;
}
