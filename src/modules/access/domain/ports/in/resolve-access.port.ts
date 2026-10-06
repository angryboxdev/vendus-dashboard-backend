import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PermissionMap, SystemProfileKey } from "../../catalog.js";
import type { ModuleSummary } from "../../services/effective-access.service.js";

/** Acesso efetivo de um utilizador numa organização (o que `can()` consulta). */
export interface AccessContext {
  userId: string;
  profile: { id: string | null; name: string; systemKey: SystemProfileKey | null };
  isAdmin: boolean;
  /** Perfil Colaborador: só o Portal, nenhum módulo de gestão. */
  portalOnly: boolean;
  active: boolean;
  permissions: PermissionMap;
  overrides: PermissionMap;
  modules: ModuleSummary[];
}

export interface ResolveAccessPort {
  /** null = não é membro desta organização. */
  execute(organizationId: OrganizationId, userId: string): Promise<AccessContext | null>;
  /** Escritas em perfis/utilizadores chamam isto para o efeito ser imediato (task §16). Sem userId = toda a organização. */
  invalidate(organizationId: OrganizationId, userId?: string): void;
}
