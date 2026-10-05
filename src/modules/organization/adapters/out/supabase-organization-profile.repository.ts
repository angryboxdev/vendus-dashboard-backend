import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { OrganizationProfile, type OrganizationStatus } from "../../domain/entities/organization-profile.js";
import type { OrganizationProfileRepositoryPort } from "../../domain/ports/out/organization-profile-repository.port.js";

const COLUMNS =
  "id, name, legal_name, nif, niss, address, postal_code, city, country, email, phone, website, timezone, logo_storage_path, status, updated_at";

interface Row {
  id: string;
  name: string;
  legal_name: string | null;
  nif: string;
  niss: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  timezone: string;
  logo_storage_path: string | null;
  status: string;
  updated_at: string;
}

function toEntity(row: Row): OrganizationProfile {
  return OrganizationProfile.reconstitute({
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    nif: row.nif,
    niss: row.niss,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    email: row.email,
    phone: row.phone,
    website: row.website,
    timezone: row.timezone,
    logoStoragePath: row.logo_storage_path,
    status: row.status as OrganizationStatus,
    updatedAt: row.updated_at,
  });
}

/**
 * `organizations` está registada com a própria PK como coluna de
 * organização (`TABLE_REGISTRY`) — o filtro aplicado pelo helper já é a
 * consulta inteira, não há um id separado a passar.
 */
export class SupabaseOrganizationProfileRepository implements OrganizationProfileRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId): Promise<OrganizationProfile | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("organizations").select(COLUMNS).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Row);
  }

  /** `status` nunca é escrito aqui — não é editável pela UI (spec D8). */
  async save(organizationId: OrganizationId, profile: OrganizationProfile): Promise<void> {
    const p = profile.toProps();
    const { error } = await this.scopedQuery(organizationId)
      .table("organizations")
      .update({
        name: p.name,
        legal_name: p.legalName,
        nif: p.nif,
        niss: p.niss,
        address: p.address,
        postal_code: p.postalCode,
        city: p.city,
        country: p.country,
        email: p.email,
        phone: p.phone,
        website: p.website,
        timezone: p.timezone,
        logo_storage_path: p.logoStoragePath,
        updated_at: p.updatedAt,
      });
    if (error) throw new Error(error.message);
  }
}
