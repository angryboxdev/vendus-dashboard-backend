import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Assignment, Contact, ContactRole, Department, Group, TermsAcceptance, UnitType } from "../../entities/org-structure.js";

export interface OrgStructureRepositoryPort {
  listDepartments(orgId: OrganizationId): Promise<Department[]>;
  createDepartment(orgId: OrganizationId, input: { name: string; createdBy: string }): Promise<Department>;
  updateDepartment(orgId: OrganizationId, id: string, patch: { name?: string; archived?: boolean }): Promise<Department>;

  listGroups(orgId: OrganizationId): Promise<Group[]>;
  createGroup(orgId: OrganizationId, input: Omit<Group, "id" | "archived" | "updatedAt"> & { createdBy: string }): Promise<Group>;
  updateGroup(orgId: OrganizationId, id: string, patch: Partial<Omit<Group, "id" | "updatedAt">>): Promise<Group>;

  listAssignments(orgId: OrganizationId, filter: { employeeId?: string; unitType?: UnitType; unitId?: string }): Promise<Assignment[]>;
  createAssignment(orgId: OrganizationId, input: Omit<Assignment, "id"> & { createdBy: string }): Promise<Assignment>;
  endAssignment(orgId: OrganizationId, id: string, validTo: string): Promise<Assignment>;
  employeeExists(orgId: OrganizationId, employeeId: string): Promise<boolean>;

  listContacts(orgId: OrganizationId): Promise<Contact[]>;
  upsertContact(orgId: OrganizationId, input: Omit<Contact, "updatedAt"> & { createdBy: string }): Promise<Contact>;

  listTermsAcceptances(orgId: OrganizationId): Promise<TermsAcceptance[]>;
  acceptTerms(orgId: OrganizationId, input: { version: string; acceptedBy: string; ip: string | null }): Promise<TermsAcceptance>;
}

export interface OrgStructureAuditPort {
  record(
    orgId: OrganizationId,
    event: { actor: string; action: string; resourceType: string; resourceId: string | null; before: unknown; after: unknown; reason: string | null },
  ): Promise<void>;
}

/** IP do pedido em curso (registo da aceitação de termos). */
export interface RequestIpPort {
  current(): string | null;
}

export type { ContactRole };
