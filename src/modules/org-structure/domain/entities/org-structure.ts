/**
 * Estrutura organizacional do Novo RH (Configurações C3.3–C3.7, C3.11).
 * Centros = `locations` (módulo locations); aqui ficam departamentos, grupos
 * hierárquicos, pertenças com vigência, contactos por função e a aceitação
 * de termos/DPA.
 */

export interface Department {
  id: string;
  name: string;
  archived: boolean;
  updatedAt: string;
}

export interface Group {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  color: string | null;
  description: string | null;
  hidden: boolean;
  archived: boolean;
  updatedAt: string;
}

export type UnitType = "department" | "group";

export interface Assignment {
  id: string;
  employeeId: string;
  unitType: UnitType;
  unitId: string;
  validFrom: string;
  validTo: string | null;
}

export const CONTACT_ROLES = ["primary", "billing", "communications", "technical", "onboarding"] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export interface Contact {
  role: ContactRole;
  name: string;
  email: string | null;
  phone: string | null;
  updatedAt: string;
}

export interface TermsAcceptance {
  id: string;
  document: "terms_and_dpa";
  version: string;
  acceptedBy: string;
  acceptedAt: string;
  ip: string | null;
}

export class OrgStructureError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "OrgStructureError";
  }
}

export class OrgStructureNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgStructureNotFound";
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[A-Za-z0-9_-]{1,30}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function cleanName(raw: unknown, field = "name"): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name || name.length > 120) throw new OrgStructureError("O nome é obrigatório (máx. 120).", field);
  return name;
}

export function validateGroupFields(g: { code: string; color: string | null; description: string | null }): void {
  if (!CODE.test(g.code)) throw new OrgStructureError("Código: letras, números, - ou _ (máx. 30).", "code");
  if (g.color !== null && !COLOR.test(g.color)) throw new OrgStructureError("Cor inválida (#RRGGBB).", "color");
  if (g.description !== null && g.description.length > 250) throw new OrgStructureError("Descrição até 250 caracteres.", "description");
}

export function validatePeriod(validFrom: string, validTo: string | null): void {
  if (!DATE.test(validFrom) || (validTo !== null && (!DATE.test(validTo) || validTo < validFrom))) {
    throw new OrgStructureError("Vigência inválida.", "validFrom");
  }
}

export function validateContact(c: { name: string; email: string | null; phone: string | null }): void {
  cleanName(c.name);
  if (c.email !== null && !EMAIL.test(c.email)) throw new OrgStructureError("E-mail inválido.", "email");
  if (c.phone !== null && c.phone.length > 30) throw new OrgStructureError("Telefone demasiado longo.", "phone");
}

/** True se pôr `groupId` debaixo de `newParentId` criaria um ciclo. */
export function wouldCreateCycle(groups: Pick<Group, "id" | "parentId">[], groupId: string, newParentId: string | null): boolean {
  const parentOf = new Map(groups.map((g) => [g.id, g.parentId]));
  let cur = newParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === groupId || seen.has(cur)) return true;
    seen.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

/** Pertenças à mesma unidade não se sobrepõem no tempo. */
export function overlapsExisting(existing: Assignment[], next: Omit<Assignment, "id">): boolean {
  return existing.some(
    (a) =>
      a.employeeId === next.employeeId &&
      a.unitType === next.unitType &&
      a.unitId === next.unitId &&
      (a.validTo === null || next.validFrom <= a.validTo) &&
      (next.validTo === null || a.validFrom <= next.validTo),
  );
}

export const activeOn = (a: { validFrom: string; validTo: string | null }, date: string) => a.validFrom <= date && (a.validTo === null || date <= a.validTo);
