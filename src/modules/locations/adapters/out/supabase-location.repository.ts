import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { Location, type GeofencePolicy } from "../../domain/entities/location.js";
import { DuplicateLocationCodeError } from "../../domain/errors.js";
import type { LocationRepositoryPort } from "../../domain/ports/out/location-repository.port.js";

const COLUMNS =
  "id, name, code, timezone, is_active, address, postal_code, city, municipality, country, phone, latitude, longitude, geofence_radius_m, geofence_policy, updated_at";

interface Row {
  id: string;
  name: string;
  code: string | null;
  timezone: string;
  is_active: boolean;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  municipality: string | null;
  country: string;
  phone: string | null;
  /** `numeric` — pode chegar como string. */
  latitude: number | string | null;
  longitude: number | string | null;
  geofence_radius_m: number;
  geofence_policy: GeofencePolicy;
  updated_at: string;
}

const numOrNull = (v: number | string | null): number | null => (v === null ? null : Number(v));

function toEntity(row: Row): Location {
  return Location.reconstitute({
    id: row.id,
    name: row.name,
    code: row.code,
    timezone: row.timezone,
    isActive: row.is_active,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    municipality: row.municipality,
    country: row.country,
    phone: row.phone,
    geofence: {
      latitude: numOrNull(row.latitude),
      longitude: numOrNull(row.longitude),
      radiusM: row.geofence_radius_m,
      policy: row.geofence_policy,
    },
    updatedAt: row.updated_at,
  });
}

function toRow(location: Location): Omit<Row, "id"> {
  return {
    name: location.name,
    code: location.code,
    timezone: location.timezone,
    is_active: location.isActive,
    address: location.address,
    postal_code: location.postalCode,
    city: location.city,
    municipality: location.municipality,
    country: location.country,
    phone: location.phone,
    latitude: location.geofence.latitude,
    longitude: location.geofence.longitude,
    geofence_radius_m: location.geofence.radiusM,
    geofence_policy: location.geofence.policy,
    updated_at: location.updatedAt ?? new Date().toISOString(),
  };
}

/** Postgres `unique_violation` — só a restrição `unique (org_id, code)` pode dispará-la nesta tabela. */
function throwWriteError(error: { code?: string; message: string }, location: Location): never {
  if (error.code === "23505" && location.code !== null) throw new DuplicateLocationCodeError(location.code);
  throw new Error(error.message);
}

/**
 * This spec's smallest end-to-end proof (D15): a new read travelling
 * request → verified claim → use case → helper → database, provably
 * returning one organization's rows and not another's. Never holds a
 * `SupabaseClient` — receives the scoped-query factory at composition time
 * (D2) and builds a scoped helper per call, so it carries no import the
 * `supabase-so-no-scoped-db` dependency-cruiser rule would flag.
 * Desde a Base Organizacional (ticket 02) também escreve — sempre pelo
 * mesmo helper, nunca com delete.
 */
export class SupabaseLocationRepository implements LocationRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findAllForOrganization(organizationId: OrganizationId): Promise<Location[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("locations")
      .select(COLUMNS)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toEntity);
  }

  async findOneForOrganization(organizationId: OrganizationId, locationId: string): Promise<Location | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("locations")
      .select(COLUMNS)
      .eq("id", locationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return toEntity(data as unknown as Row);
  }

  async insert(organizationId: OrganizationId, location: Location): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("locations")
      .insert({ id: location.id, ...toRow(location) });
    if (error) throwWriteError(error, location);
  }

  async update(organizationId: OrganizationId, location: Location): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("locations").update(toRow(location)).eq("id", location.id);
    if (error) throwWriteError(error, location);
  }
}
