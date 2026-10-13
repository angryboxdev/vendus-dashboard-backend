import type { Employee } from "../../entities/employee.js";

/**
 * Quem está a pedir. Montado pelo composition root a partir do módulo access
 * (privacidade por campo, âmbitos, permissões especiais) — o domínio só vê
 * estas perguntas.
 */
export interface Viewer {
  actor: string;
  isAdmin: boolean;
  /** Permissão especial `hr.people_export`. */
  canExport: boolean;
  /** Pode ver/editar campos personalizados marcados como sensíveis (`hr.sensitive_data`). */
  canSensitive: boolean;
  /** Privacidade por campo (chave do catálogo do módulo access). */
  field(privacyKey: string): { view: boolean; edit: boolean };
  /** Âmbito (RE-34): o pedido abrange este colaborador nesta data? */
  canSee(employeeId: string, date: string): Promise<boolean>;
}

/** Ficha vista por alguém: campos sem permissão vêm a null e listados em `hidden`. */
export interface EmployeeView extends Omit<Employee, "photoPath"> {
  /** Foto: URL assinado de curta duração (ou null). */
  photoUrl: string | null;
  hidden: string[];
  /** Obrigatórios em falta (fichas antigas "a completar"). */
  missing: string[];
}

export interface ImportRowResult {
  line: number;
  ok: boolean;
  errors: string[];
  name: string;
}

export interface ImportResult {
  dryRun: boolean;
  total: number;
  valid: number;
  created: number;
  rows: ImportRowResult[];
}
