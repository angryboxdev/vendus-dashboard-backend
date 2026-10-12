import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { LegalEntity, LegalEntityInput } from "../../domain/entities/legal-entity.js";
import type { LegalEntitiesRepositoryPort } from "../../domain/ports/out/legal-entities.ports.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const COLS = "id, name, country, tax_id_type, tax_id, social_security_id, billing_email, street, postal_code, city, region, phone, status, created_at, updated_at";

const toEntity = (r: Row): LegalEntity => ({
  id: String(r.id),
  name: String(r.name),
  country: r.country as LegalEntity["country"],
  taxIdType: r.tax_id_type as LegalEntity["taxIdType"],
  taxId: String(r.tax_id),
  socialSecurityId: String(r.social_security_id),
  billingEmail: String(r.billing_email),
  street: String(r.street),
  postalCode: String(r.postal_code),
  city: String(r.city),
  region: String(r.region),
  phone: r.phone ? String(r.phone) : null,
  status: r.status as LegalEntity["status"],
  createdAt: new Date(String(r.created_at)).toISOString(),
  updatedAt: new Date(String(r.updated_at)).toISOString(),
});

function toRow(p: Partial<LegalEntityInput> & { status?: LegalEntity["status"] }): Row {
  const row: Row = {};
  if (p.name !== undefined) row.name = p.name;
  if (p.country !== undefined) row.country = p.country;
  if (p.taxIdType !== undefined) row.tax_id_type = p.taxIdType;
  if (p.taxId !== undefined) row.tax_id = p.taxId;
  if (p.socialSecurityId !== undefined) row.social_security_id = p.socialSecurityId;
  if (p.billingEmail !== undefined) row.billing_email = p.billingEmail;
  if (p.street !== undefined) row.street = p.street;
  if (p.postalCode !== undefined) row.postal_code = p.postalCode;
  if (p.city !== undefined) row.city = p.city;
  if (p.region !== undefined) row.region = p.region;
  if (p.phone !== undefined) row.phone = p.phone;
  if (p.status !== undefined) row.status = p.status;
  return row;
}

export class SupabaseLegalEntitiesRepository implements LegalEntitiesRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async list(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("legal_entities").select(COLS).order("name").limit(500)).map(toEntity);
  }
  async get(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("legal_entities").select(COLS).eq("id", id).maybeSingle());
    return r ? toEntity(r) : null;
  }
  async findByTaxId(org: OrganizationId, country: string, taxId: string) {
    const r = check<Row | null>(await this.scoped(org).table("legal_entities").select(COLS).eq("country", country).eq("tax_id", taxId).maybeSingle());
    return r ? toEntity(r) : null;
  }
  async create(org: OrganizationId, input: LegalEntityInput, by: string) {
    return toEntity(check(await this.scoped(org).table("legal_entities").insert({ ...toRow(input), created_by: by }).select(COLS).single()));
  }
  async update(org: OrganizationId, id: string, patch: Partial<LegalEntityInput> & { status?: LegalEntity["status"] }) {
    return toEntity(check(await this.scoped(org).table("legal_entities").update({ ...toRow(patch), updated_at: new Date().toISOString() }).eq("id", id).select(COLS).single()));
  }
  async locationLinks(org: OrganizationId) {
    const rows = check<Row[]>(await this.scoped(org).table("legal_entity_locations").select("location_id, legal_entity_id").limit(1000));
    return rows.map((r) => ({ locationId: String(r.location_id), legalEntityId: String(r.legal_entity_id) }));
  }
  async setLocationEntity(org: OrganizationId, locationId: string, legalEntityId: string | null) {
    if (legalEntityId === null) {
      check(await this.scoped(org).table("legal_entity_locations").delete().eq("location_id", locationId));
      return;
    }
    check(await this.scoped(org).table("legal_entity_locations").upsert({ location_id: locationId, legal_entity_id: legalEntityId, updated_at: new Date().toISOString() }, { onConflict: "org_id,location_id" }));
  }
}
