import type { OrganizationId } from "../../../kernel/organization-id.js";
import type { LegalEntity, LegalEntityInput } from "../domain/entities/legal-entity.js";
import type { LegalEntitiesContextPort, LegalEntitiesRepositoryPort } from "../domain/ports/out/legal-entities.ports.js";

/** Fakes dos ports de saída (sem BD). */
export class FakeLegalRepo implements LegalEntitiesRepositoryPort {
  items: LegalEntity[] = [];
  links: { locationId: string; legalEntityId: string }[] = [];
  async list() {
    return this.items.map((e) => ({ ...e }));
  }
  async get(_o: OrganizationId, id: string) {
    const e = this.items.find((x) => x.id === id);
    return e ? { ...e } : null;
  }
  async findByTaxId(_o: OrganizationId, country: string, taxId: string) {
    return this.items.find((x) => x.country === country && x.taxId === taxId) ?? null;
  }
  async create(_o: OrganizationId, input: LegalEntityInput) {
    const e: LegalEntity = { ...input, id: `le${this.items.length + 1}`, status: "active", createdAt: "2026-10-12T10:00:00.000Z", updatedAt: "2026-10-12T10:00:00.000Z" };
    this.items.push(e);
    return { ...e };
  }
  async update(_o: OrganizationId, id: string, patch: Partial<LegalEntityInput> & { status?: LegalEntity["status"] }) {
    const e = this.items.find((x) => x.id === id)!;
    Object.assign(e, patch, { updatedAt: `2026-10-12T11:00:0${this.items.length}.000Z` });
    return { ...e };
  }
  async locationLinks() {
    return this.links.map((l) => ({ ...l }));
  }
  async setLocationEntity(_o: OrganizationId, locationId: string, legalEntityId: string | null) {
    this.links = this.links.filter((l) => l.locationId !== locationId);
    if (legalEntityId) this.links.push({ locationId, legalEntityId });
  }
}

export class FakeLegalCtx implements LegalEntitiesContextPort {
  audits: { action: string; reason: string | null }[] = [];
  contracts = 0;
  async activeLocations() {
    return [
      { id: "porto", name: "Porto" },
      { id: "gijon", name: "Gijón" },
    ];
  }
  async activeContractsAt() {
    return this.contracts;
  }
  now() {
    return "2026-10-12T10:00:00.000Z";
  }
  async audit(_o: OrganizationId, e: { action: string; reason: string | null }) {
    this.audits.push({ action: e.action, reason: e.reason });
  }
}

// Dados fictícios: NIF/CIF de exemplo com dígito de controlo válido.
export const PT: LegalEntityInput = { name: "Entidade PT Demo", country: "PT", taxIdType: "nif", taxId: "123 456 789", socialSecurityId: "20000000000", billingEmail: "Faturacao@demo.invalid", street: "Rua Exemplo 1", postalCode: "4000-001", city: "Porto", region: "Porto", phone: "+351 220 000 000" };
