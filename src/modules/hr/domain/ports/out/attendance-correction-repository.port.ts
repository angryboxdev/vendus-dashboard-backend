import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Fase 2.1 — substitui por completo o conjunto anterior (mais granular:
 * add_entry/add_exit/fix_entry/fix_exit/confirm/observation) pelas 5
 * ações do mockup de resolução de ocorrência. Seguro substituir sem
 * migração de dados: as migrações desta tabela ainda não foram aplicadas
 * em produção (ver README, Known gaps), e nada além do write path novo
 * (`CorrectShiftAttendanceUseCase`) consome este tipo.
 */
export type AttendanceCorrectionType = "keep_as_is" | "fix_times" | "justify_no_impact" | "mark_absence" | "remove_marking";

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
  /** Ausência de Férias & Ausências a que esta ocorrência ficou vinculada. */
  absenceId?: string | null;
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
  absenceId: string | null;
}

/**
 * Trilha estruturada de correções manuais (Fase 2) — ledger só de
 * inserção, nunca atualizado/apagado. `hr_shift_attendance` continua a
 * ser a tabela "efetiva"; este port é só o histórico ao lado.
 */
export interface AttendanceCorrectionRepositoryPort {
  record(entry: AttendanceCorrectionRecord): Promise<AttendanceCorrectionDTO>;
  findByShiftId(organizationId: OrganizationId, workShiftId: string): Promise<AttendanceCorrectionDTO[]>;
  /**
   * Fase 2.1 — 1 query para todas as correções do período (nunca N+1 por
   * linha da Conferência/Resumo mensal). Usado para derivar `reviewStatus`
   * (existe ≥1 correção para o turno/colaborador+dia) e para saber se a
   * mais recente é `justify_no_impact` (exclui da soma dos KPIs).
   */
  listInRange(organizationId: OrganizationId, from: string, to: string): Promise<AttendanceCorrectionDTO[]>;
}
