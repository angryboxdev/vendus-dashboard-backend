import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";

/** Lê só id/nome/estado da tabela `locations`, sem importar o módulo locations. */
export class SupabaseLocationReadAdapter implements LocationReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId, id: string) {
    const { data, error } = await this.scopedQuery(organizationId).table("locations").select("id, name, is_active").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as unknown as { id: string; name: string; is_active: boolean };
    return { id: row.id, name: row.name, isActive: row.is_active };
  }
}
