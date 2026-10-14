import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Lojas da organização (só leitura) — para validar destinos habituais e exceções por loja. */
export interface LocationReadPort {
  findById(organizationId: OrganizationId, id: string): Promise<{ id: string; name: string; isActive: boolean } | null>;
}
