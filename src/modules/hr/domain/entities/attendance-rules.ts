/**
 * Fase 2.1 ("Regras de Assiduidade, Tolerâncias e Conferência") — cada
 * alteração às tolerâncias insere uma NOVA linha (nunca UPDATE), com os 5
 * valores completos + vigência — mesmo princípio de "versionamento por
 * nova linha" já usado em `hr_employee_documents` (nunca reescreve
 * silenciosamente o histórico, task secção 4). Não é uma classe com
 * transições de estado (ao contrário de `MonthlyClosure`) porque não há
 * nenhuma: é sempre um snapshot imutável, "atualizar" = criar uma versão
 * nova.
 */
export interface AttendanceRulesVersion {
  id: string;
  organizationId: string;
  entryToleranceMinutes: number;
  earlyExitToleranceMinutes: number;
  absenceThresholdMinutes: number;
  preShiftWindowMinutes: number;
  postShiftWindowMinutes: number;
  /**
   * "Início do controlo de assiduidade" — turnos com `workDate` anterior
   * a esta data nunca geram pendência AUTOMÁTICA por tolerância (task
   * "Assiduidade — Conferência, Por Colaborador e Horas & Saldos",
   * secção 11); um sinal manual já existente continua a aparecer
   * normalmente. `null` = sem limite (controla desde sempre).
   */
  controlStartDate: string | null;
  /** Data (YYYY-MM-DD) a partir da qual esta versão passa a ser a vigente. */
  effectiveFrom: string;
  changedBy: string;
  createdAt: string;
}

export type AttendanceRulesValues = Pick<
  AttendanceRulesVersion,
  | "entryToleranceMinutes"
  | "earlyExitToleranceMinutes"
  | "absenceThresholdMinutes"
  | "preShiftWindowMinutes"
  | "postShiftWindowMinutes"
  | "controlStartDate"
>;

/** Só os 5 campos numéricos — usado para o histórico por campo (diffs numéricos, ver `ListAttendanceRuleChangesUseCase`). `controlStartDate` não entra nesse histórico (não é numérico). */
export type AttendanceToleranceValues = Omit<AttendanceRulesValues, "controlStartDate">;

export const ATTENDANCE_RULES_FIELDS: (keyof AttendanceToleranceValues)[] = [
  "entryToleranceMinutes",
  "earlyExitToleranceMinutes",
  "absenceThresholdMinutes",
  "preShiftWindowMinutes",
  "postShiftWindowMinutes",
];

/**
 * Fallback quando a organização ainda não configurou nenhuma regra —
 * valores dos exemplos da própria task (secção 2), nunca `0`/indefinido.
 * `controlStartDate: null` = sem limite, mesmo comportamento de antes
 * desta task existir.
 */
export const DEFAULT_ATTENDANCE_RULES: AttendanceRulesValues = {
  entryToleranceMinutes: 10,
  earlyExitToleranceMinutes: 5,
  absenceThresholdMinutes: 60,
  preShiftWindowMinutes: 30,
  postShiftWindowMinutes: 60,
  controlStartDate: null,
};
