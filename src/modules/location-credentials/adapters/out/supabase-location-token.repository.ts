import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { LocationToken } from "../../domain/entities/location-token.js";
import type { LocationTokenRepositoryPort } from "../../domain/ports/out/location-token-repository.port.js";

function toEntity(row: Record<string, unknown>): LocationToken {
  return LocationToken.reconstitute({
    id: row.id as string,
    organizationId: mintOrganizationId(row.org_id as string),
    locationId: row.location_id as string,
    tokenHash: row.token_hash as string,
    issuedAt: new Date(row.issued_at as string),
    description: (row.description as string | null) ?? null,
  });
}

/**
 * Every operation here already knows the organization (generation-time,
 * command-supplied for list/revoke), so this adapter never needs the
 * unscoped door — unlike the pairing-code adapter's `findByCode`. Token
 * *validation* (looked up by hash, with no organization known yet) is a
 * separate concern, served by `requireDeviceAuth`'s own unscoped door
 * (`src/infra/scoped-db/device-token-lookup.ts`), not this port.
 */
export class SupabaseLocationTokenRepository implements LocationTokenRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async save(token: LocationToken): Promise<void> {
    const { error } = await this.scopedQuery(token.organizationId)
      .table("location_tokens")
      .insert({
        id: token.id,
        location_id: token.locationId,
        token_hash: token.tokenHash,
        description: token.description,
      });
    if (error) throw new Error(error.message);
  }

  async listByLocation(organizationId: OrganizationId, locationId: string): Promise<LocationToken[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("location_tokens")
      .select("id, org_id, location_id, token_hash, issued_at, description")
      .eq("location_id", locationId)
      .order("issued_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => toEntity(row));
  }

  async deleteById(organizationId: OrganizationId, tokenId: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("location_tokens").delete().eq("id", tokenId);
    if (error) throw new Error(error.message);
  }
}
