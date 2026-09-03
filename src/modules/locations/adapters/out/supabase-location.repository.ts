import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { Location } from "../../domain/entities/location.js";
import type { LocationRepositoryPort } from "../../domain/ports/out/location-repository.port.js";

function toEntity(row: Record<string, unknown>): Location {
  return Location.reconstitute({
    id: row.id as string,
    name: row.name as string,
    code: row.code as string,
    timezone: row.timezone as string,
    isActive: row.is_active as boolean,
  });
}

/**
 * This spec's smallest end-to-end proof (D15): a new read travelling
 * request → verified claim → use case → helper → database, provably
 * returning one organization's rows and not another's. Never holds a
 * `SupabaseClient` — receives the scoped-query factory at composition time
 * (D2) and builds a scoped helper per call, so it carries no import the
 * `supabase-so-no-scoped-db` dependency-cruiser rule would flag.
 */
export class SupabaseLocationRepository implements LocationRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findAllForOrganization(organizationId: OrganizationId): Promise<Location[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("locations")
      .select("id, name, code, timezone, is_active")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => toEntity(row));
  }

  async findOneForOrganization(organizationId: OrganizationId, locationId: string): Promise<Location | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("locations")
      .select("id, name, code, timezone, is_active")
      .eq("id", locationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Record<string, unknown>);
  }
}
