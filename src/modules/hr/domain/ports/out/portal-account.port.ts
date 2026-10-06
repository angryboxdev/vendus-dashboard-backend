import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Conta de acesso (Supabase Auth + `org_members`) de um membro da organização. */
export interface OrgAccount {
  userId: string;
  email: string;
  role: string;
}

/**
 * Contas de acesso e ligação conta ↔ colaborador (Portal do Colaborador,
 * ticket 02). A ligação vive em `hr_employees.user_id`; as contas em
 * Supabase Auth + `org_members`. Nunca cria colaboradores.
 */
export interface PortalAccountPort {
  /** Membro desta organização com este email (comparação sem maiúsculas), ou null. */
  findMemberByEmail(organizationId: OrganizationId, email: string): Promise<OrgAccount | null>;
  findMemberById(organizationId: OrganizationId, userId: string): Promise<OrgAccount | null>;
  /** Cria conta `employee` com palavra-passe temporária (mudança obrigatória no 1º login). Devolve o userId. */
  createEmployeeAccount(organizationId: OrganizationId, email: string, temporaryPassword: string): Promise<string>;
  /** Apaga uma conta criada só para o Portal (papel `employee`). */
  deleteEmployeeAccount(organizationId: OrganizationId, userId: string): Promise<void>;
  findLinkedUserId(organizationId: OrganizationId, employeeId: string): Promise<string | null>;
  findLinkedEmployeeId(organizationId: OrganizationId, userId: string): Promise<string | null>;
  link(organizationId: OrganizationId, employeeId: string, userId: string): Promise<void>;
  unlink(organizationId: OrganizationId, employeeId: string): Promise<void>;
}
