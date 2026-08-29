import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { OrganizationIdentity } from "../../domain/entities/organization-identity.js";
import type { OrganizationIdentityPort } from "../../domain/ports/out/organization-identity.port.js";

function toEntity(row: Record<string, unknown>): OrganizationIdentity {
  return OrganizationIdentity.reconstitute({
    id: row.id as string,
    name: row.name as string,
    nif: row.nif as string,
    address: (row.address as string | null) ?? null,
    email: (row.email as string | null) ?? null,
  });
}

/**
 * Nunca guarda um `SupabaseClient` — recebe o factory `createScopedQuery`
 * (`ScopedQueryFactory`) injectado pelo composition root e constrói um
 * `ScopedQuery` por chamada (D2). A tabela `organizations` está registada
 * com a sua própria PK como coluna de organização (`TABLE_REGISTRY`), pelo
 * que o `.eq("id", organizationId)` já aplicado pelo helper é a própria
 * consulta — não há um id separado a filtrar.
 */
export class SupabaseOrganizationIdentityRepository implements OrganizationIdentityPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId): Promise<OrganizationIdentity | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("organizations")
      .select("id, name, nif, address, email")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }
}
