import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { LegalEntity, LegalEntityInput } from "../../entities/legal-entity.js";

export interface LegalEntitiesRepositoryPort {
  list(org: OrganizationId): Promise<LegalEntity[]>;
  get(org: OrganizationId, id: string): Promise<LegalEntity | null>;
  /** Outra entidade (ativa ou arquivada) com a mesma identificação fiscal no país. */
  findByTaxId(org: OrganizationId, country: string, taxId: string): Promise<LegalEntity | null>;
  create(org: OrganizationId, input: LegalEntityInput, by: string): Promise<LegalEntity>;
  update(org: OrganizationId, id: string, patch: Partial<LegalEntityInput> & { status?: LegalEntity["status"] }): Promise<LegalEntity>;
  /** Centro → entidade (um centro tem no máximo uma entidade). */
  locationLinks(org: OrganizationId): Promise<{ locationId: string; legalEntityId: string }[]>;
  setLocationEntity(org: OrganizationId, locationId: string, legalEntityId: string | null): Promise<void>;
}

export interface LegalEntitiesContextPort {
  /** Centros ativos da organização. */
  activeLocations(org: OrganizationId): Promise<{ id: string; name: string }[]>;
  /** Contratos em vigor de colaboradores cujo centro principal está na lista. */
  activeContractsAt(org: OrganizationId, locationIds: string[]): Promise<number>;
  now(): string;
  audit(org: OrganizationId, e: { actor: string; action: string; resourceId: string; before: unknown; after: unknown; reason: string | null }): Promise<void>;
}
