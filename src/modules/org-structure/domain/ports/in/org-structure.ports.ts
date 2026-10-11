import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Assignment, Contact, ContactRole, Department, Group, TermsAcceptance, UnitType } from "../../entities/org-structure.js";

export interface GroupInput {
  parentId: string | null;
  code: string;
  name: string;
  color: string | null;
  description: string | null;
  hidden: boolean;
}

export interface OrgStructurePorts {
  listDepartments(orgId: OrganizationId): Promise<Department[]>;
  createDepartment(orgId: OrganizationId, name: string, actor: string): Promise<Department>;
  updateDepartment(orgId: OrganizationId, id: string, patch: { name?: string; archived?: boolean }, actor: string): Promise<Department>;

  listGroups(orgId: OrganizationId): Promise<Group[]>;
  createGroup(orgId: OrganizationId, input: GroupInput, actor: string): Promise<Group>;
  updateGroup(orgId: OrganizationId, id: string, patch: Partial<GroupInput> & { archived?: boolean }, actor: string): Promise<Group>;

  listAssignments(orgId: OrganizationId, filter: { employeeId?: string; unitType?: UnitType; unitId?: string }): Promise<Assignment[]>;
  assign(orgId: OrganizationId, input: Omit<Assignment, "id">, actor: string): Promise<Assignment>;
  endAssignment(orgId: OrganizationId, id: string, validTo: string, actor: string): Promise<Assignment>;

  listContacts(orgId: OrganizationId): Promise<Contact[]>;
  setContact(orgId: OrganizationId, role: ContactRole, input: { name: string; email: string | null; phone: string | null }, actor: string): Promise<Contact>;

  listTermsAcceptances(orgId: OrganizationId): Promise<TermsAcceptance[]>;
  acceptTerms(orgId: OrganizationId, version: string, actor: string): Promise<TermsAcceptance>;

  /** Departamentos e grupos do colaborador numa data (motor de configurações). */
  /** `locationIds` = null quando o colaborador ainda não tem centros com vigência (vale o centro principal). */
  unitsOf(orgId: OrganizationId, employeeId: string, date: string): Promise<{ departmentIds: string[]; groupIds: string[]; locationIds: string[] | null }>;
  /**
   * CF-2 / TK-10: muda o centro a partir de `effectiveDate`. Os dias anteriores
   * mantêm o centro antigo (fica uma pertença com vigência para cada um).
   */
  transfer(orgId: OrganizationId, employeeId: string, locationId: string, effectiveDate: string, actor: string, reason: string): Promise<Assignment>;
  /** Colaboradores com pertença ativa às unidades numa data (pré-visualização de impacto). */
  membersOf(orgId: OrganizationId, unitType: UnitType, unitIds: string[], date: string): Promise<string[]>;
}
