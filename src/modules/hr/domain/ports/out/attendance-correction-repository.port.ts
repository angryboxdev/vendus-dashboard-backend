import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type AttendanceCorrectionType =
  | "add_entry"
  | "add_exit"
  | "fix_entry"
  | "fix_exit"
  | "mark_absence"
  | "confirm"
  | "observation";

/** Snapshot de um lado (antes ou depois) de uma correção — nunca editado depois de gravado. */
export interface AttendanceSnapshot {
  status: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
}

export interface AttendanceCorrectionRecord {
  organizationId: OrganizationId;
  workShiftId: string | null;
  employeeId: string;
  workDate: string;
  correctionType: AttendanceCorrectionType;
  original: AttendanceSnapshot | null;
  corrected: AttendanceSnapshot | null;
  reason: string;
  notes: string | null;
  actor: string;
}

export interface AttendanceCorrectionDTO {
  id: string;
  workShiftId: string | null;
  employeeId: string;
  workDate: string;
  correctionType: AttendanceCorrectionType;
  original: AttendanceSnapshot | null;
  corrected: AttendanceSnapshot | null;
  reason: string;
  notes: string | null;
  actor: string;
  createdAt: string;
}

/**
 * Trilha estruturada de correções manuais (Fase 2) — ledger só de
 * inserção, nunca atualizado/apagado. `hr_shift_attendance` continua a
 * ser a tabela "efetiva"; este port é só o histórico ao lado.
 */
export interface AttendanceCorrectionRepositoryPort {
  record(entry: AttendanceCorrectionRecord): Promise<AttendanceCorrectionDTO>;
  findByShiftId(organizationId: OrganizationId, workShiftId: string): Promise<AttendanceCorrectionDTO[]>;
}
