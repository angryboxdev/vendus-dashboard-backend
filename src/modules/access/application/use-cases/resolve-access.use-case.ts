import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { LEGACY_ROLE_TO_PROFILE } from "../../domain/catalog.js";
import type { AccessContext, ResolveAccessPort } from "../../domain/ports/in/resolve-access.port.js";
import type { AccessRepositoryPort } from "../../domain/ports/out/access-repository.port.js";
import { effectivePermissions, summarizeModules } from "../../domain/services/effective-access.service.js";

type Clock = () => number;

/**
 * Resolve o acesso efetivo a partir da BD (perfil + exceções + estado) —
 * nunca do token, para revogações e desativações valerem no pedido
 * seguinte (task §16, decisão U4). Cache curta em memória (`ttlMs`) só para
 * não ir à BD em cada pedido; as escritas chamam `invalidate`, e com várias
 * instâncias o atraso máximo é o TTL.
 *
 * Membership sem `profile_id` (contas criadas antes da migração ou pelo
 * fluxo legado) usa o perfil de sistema do papel antigo.
 */
export class ResolveAccessUseCase implements ResolveAccessPort {
  private readonly cache = new Map<string, { at: number; value: AccessContext | null }>();

  constructor(
    private readonly repository: AccessRepositoryPort,
    private readonly ttlMs = 15_000,
    private readonly now: Clock = () => Date.now(),
  ) {}

  async execute(organizationId: OrganizationId, userId: string): Promise<AccessContext | null> {
    const key = `${String(organizationId)}:${userId}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    const value = await this.load(organizationId, userId);
    this.cache.set(key, { at: this.now(), value });
    return value;
  }

  invalidate(organizationId: OrganizationId, userId?: string): void {
    const prefix = `${String(organizationId)}:`;
    for (const key of this.cache.keys()) {
      if (userId ? key === `${prefix}${userId}` : key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  private async load(organizationId: OrganizationId, userId: string): Promise<AccessContext | null> {
    const member = await this.repository.findMember(organizationId, userId);
    if (!member) return null;

    let profile = member.profileId ? await this.repository.findProfileById(organizationId, member.profileId) : null;
    if (!profile) {
      const fallback = LEGACY_ROLE_TO_PROFILE[member.legacyRole];
      profile = fallback ? await this.repository.findSystemProfile(organizationId, fallback) : null;
    }

    const isAdmin = profile?.systemKey === "admin";
    const portalOnly = profile?.systemKey === "colaborador";
    // Colaborador nunca tem módulos de gestão, mesmo com exceções gravadas por engano.
    const overrides = portalOnly ? {} : member.overrides;
    const permissions = effectivePermissions(portalOnly ? {} : (profile?.permissions ?? {}), overrides, isAdmin);

    return {
      userId,
      profile: { id: profile?.id ?? null, name: profile?.name ?? "Sem perfil", systemKey: profile?.systemKey ?? null },
      isAdmin,
      portalOnly,
      active: member.status === "active",
      permissions,
      overrides,
      modules: summarizeModules(permissions, overrides),
    };
  }
}
