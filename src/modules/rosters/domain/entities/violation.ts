/** Violação de uma restrição da escala (RE-16, RE-18). */
export type Severity = "warning" | "block";
export type RuleKey = "overlap" | "min_rest" | "max_daily" | "max_weekly" | "max_annual" | "absence";

/** O outro turno de uma sobreposição (para o gestor o encontrar e corrigir). */
export interface ConflictRef {
  shiftId: string | null;
  rosterId: string | null;
  rosterName: string | null;
  workDate: string;
  /** Horário do outro turno, ex.: "14:00–22:00". */
  hours: string;
  /** O outro turno já está publicado (false = rascunho). */
  published: boolean;
}

export interface Violation {
  rule: RuleKey;
  severity: Severity;
  employeeId: string;
  workDate: string;
  message: string;
  /** Turno afetado (quando já existe; num turno novo ainda não há id). */
  shiftId?: string | null;
  rosterId?: string | null;
  /** Só sobreposição: o turno incompatível e o troço em que se sobrepõem (ex.: "14:00–17:00"). */
  conflict?: ConflictRef;
  overlap?: string;
}
