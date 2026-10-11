/**
 * Âmbitos (Eng. Reversa 9.1/12.1: papel × permissão × âmbito). Perfil
 * Geral → toda a organização. Perfil Específico → só os colaboradores que
 * os âmbitos ativos na data cobrem (centro, departamento, grupo, ou o
 * próprio). Sem âmbitos → ninguém (fecha por omissão).
 */

export type ScopeType = "location" | "department" | "group" | "self";
export type ScopeKind = "general" | "specific";

export interface AccessScope {
  id: string;
  userId: string;
  scopeType: ScopeType;
  /** null quando `self`. */
  scopeId: string | null;
  validFrom: string;
  validTo: string | null;
}

/** Onde um colaborador está numa data. */
export interface EmployeeUnits {
  employeeId: string;
  locationIds: string[];
  departmentIds: string[];
  groupIds: string[];
}

const activeOn = (s: { validFrom: string; validTo: string | null }, date: string) => s.validFrom <= date && (s.validTo === null || date <= s.validTo);

export interface ScopeSubject {
  isAdmin: boolean;
  scopeKind: ScopeKind;
  scopes: AccessScope[];
  /** Ficha do próprio utilizador (para o âmbito `self`). */
  ownEmployeeId: string | null;
}

/** O utilizador gere este colaborador nesta data? */
export function coversEmployee(subject: ScopeSubject, employee: EmployeeUnits, date: string): boolean {
  if (subject.isAdmin || subject.scopeKind === "general") return true;
  return subject.scopes.some((s) => {
    if (!activeOn(s, date)) return false;
    switch (s.scopeType) {
      case "self":
        return subject.ownEmployeeId !== null && subject.ownEmployeeId === employee.employeeId;
      case "location":
        return employee.locationIds.includes(s.scopeId ?? "");
      case "department":
        return employee.departmentIds.includes(s.scopeId ?? "");
      case "group":
        return employee.groupIds.includes(s.scopeId ?? "");
    }
  });
}

/** Âmbitos do mesmo tipo e alvo não se sobrepõem no tempo. */
export function scopeOverlaps(existing: AccessScope[], next: Omit<AccessScope, "id">): boolean {
  return existing.some(
    (s) =>
      s.userId === next.userId &&
      s.scopeType === next.scopeType &&
      s.scopeId === next.scopeId &&
      (s.validTo === null || next.validFrom <= s.validTo) &&
      (next.validTo === null || s.validFrom <= next.validTo),
  );
}
