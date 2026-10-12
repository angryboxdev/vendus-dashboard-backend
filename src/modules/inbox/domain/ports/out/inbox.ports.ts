import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { InboxDecision, InboxItem, InboxType } from "../../entities/inbox.js";

export interface InboxActor {
  userId: string;
  email: string;
}

/**
 * Uma fonte por tipo de pedido (ligada no server.ts ao caso de uso do módulo
 * dono). `decide` usa a regra do próprio módulo e lança o erro dele quando
 * recusa (autoaprovação, nível, período fechado…).
 */
export interface InboxSourcePort {
  type: InboxType;
  /** Permissão que dá acesso ao tipo (READ para ver, MANAGE para decidir). */
  permission: string;
  list(org: OrganizationId, actor: InboxActor, opts: { canPrivate: boolean; employeeIds: string[] }): Promise<InboxItem[]>;
  decide(org: OrganizationId, actor: InboxActor, item: InboxItem, decision: InboxDecision, comment: string | null): Promise<void>;
}

export interface InboxDirectoryPort {
  /** Colaboradores ativos e inativos com pedidos: nome e centro principal. */
  people(org: OrganizationId): Promise<{ id: string; name: string; locationName: string | null }[]>;
}
