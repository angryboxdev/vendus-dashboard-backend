import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Estado do acesso ao Portal na ficha do colaborador. */
export interface PortalAccessDTO {
  hasAccess: boolean;
  email: string | null;
  /** `employee` = conta criada só para o Portal; `staff` = conta de gestão (admin/manager/hr_viewer) ligada à ficha. */
  accountKind: "employee" | "staff" | null;
}

export interface GrantPortalAccessResultDTO extends PortalAccessDTO {
  /** Só quando foi criada uma conta nova — mostrada UMA vez ao gestor para entregar ao colaborador. */
  temporaryPassword: string | null;
}

export interface PortalAccessCommand {
  organizationId: OrganizationId;
  actor: string;
  employeeId: string;
  /** Utilizadores & Perfis 2.0 (U6): só o Admin liga/desliga contas de GESTÃO a fichas; quem gere Colaboradores só trata contas Colaborador. */
  actorIsAdmin: boolean;
}

export interface GetPortalAccessPort {
  execute(query: { organizationId: OrganizationId; employeeId: string }): Promise<PortalAccessDTO>;
}

export interface GrantPortalAccessPort {
  execute(command: PortalAccessCommand): Promise<GrantPortalAccessResultDTO>;
}

export interface RevokePortalAccessPort {
  execute(command: PortalAccessCommand): Promise<void>;
}
