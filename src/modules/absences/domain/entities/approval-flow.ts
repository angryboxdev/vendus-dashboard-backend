import { AbsenceValidationError } from "../errors.js";

/**
 * Fluxo de aprovação multinível (C6.4). Cada nível tem pessoas (aprovam
 * qualquer pedido) e/ou papéis: `managers` (responsáveis do colaborador) ou
 * `profile:<id>` (utilizadores com esse perfil de acesso).
 */
export interface FlowLevel {
  people: string[];
  roles: string[];
}

export interface ApprovalFlow {
  id: string;
  name: string;
  scope: "absences" | "clock";
  isDefault: boolean;
  levels: FlowLevel[];
  /** D9: pessoas de recurso; vazio = administradores da organização. */
  fallbackUserIds: string[];
  archived: boolean;
}

export type ApprovalFlowInput = Omit<ApprovalFlow, "id" | "archived">;

const ROLE = /^(managers|profile:[0-9a-f-]{36})$/i;

/** CF-5: um fluxo só se grava se todos os níveis tiverem aprovadores. */
export function validateFlow(f: ApprovalFlowInput): void {
  if (!f.name?.trim() || f.name.trim().length > 80) throw new AbsenceValidationError("O nome é obrigatório (máx. 80).", "name");
  if (f.scope !== "absences" && f.scope !== "clock") throw new AbsenceValidationError("Âmbito inválido.", "scope");
  if (!Array.isArray(f.levels) || f.levels.length < 1 || f.levels.length > 5) throw new AbsenceValidationError("Um fluxo tem de 1 a 5 níveis.", "levels");
  f.levels.forEach((l, i) => {
    if (!Array.isArray(l.people) || !Array.isArray(l.roles)) throw new AbsenceValidationError(`Nível ${i + 1} inválido.`, "levels");
    if (l.people.length === 0 && l.roles.length === 0) throw new AbsenceValidationError(`O nível ${i + 1} não tem aprovadores.`, "levels");
    if (l.roles.some((r) => !ROLE.test(r))) throw new AbsenceValidationError(`Papel inválido no nível ${i + 1}.`, "levels");
  });
}

/** Aprovadores de um nível, fixados na criação do pedido. */
export interface LevelSnapshot {
  approvers: string[];
  /** Nível sem aprovador (ou só com quem pede) → foi para o recurso (RE-23). */
  escalated: boolean;
}

/**
 * RE-22/RE-23: quem pede e o próprio colaborador nunca aprovam. Um nível que
 * fica sem ninguém escala para o recurso (nunca é aprovado sozinho).
 * Devolve null se nem o recurso tiver alguém que possa aprovar.
 */
export function snapshotLevels(resolved: string[][], excluded: Set<string>, fallback: string[]): LevelSnapshot[] | null {
  const fb = [...new Set(fallback)].filter((u) => !excluded.has(u));
  const out: LevelSnapshot[] = [];
  for (const users of resolved) {
    const approvers = [...new Set(users)].filter((u) => !excluded.has(u));
    if (approvers.length) out.push({ approvers, escalated: false });
    else if (fb.length) out.push({ approvers: fb, escalated: true });
    else return null;
  }
  return out;
}
