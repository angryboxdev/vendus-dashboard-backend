import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { COUNTRIES, FISCAL_FIELDS, LegalEntityError, validateLegalEntity, type LegalEntity, type LegalEntityInput } from "../../domain/entities/legal-entity.js";
import type { LegalEntitiesContextPort, LegalEntitiesRepositoryPort } from "../../domain/ports/out/legal-entities.ports.js";

export interface Actor {
  email: string;
}

const MIN_REASON = 5;

export class LegalEntitiesUseCases {
  constructor(
    private readonly repo: LegalEntitiesRepositoryPort,
    private readonly ctx: LegalEntitiesContextPort,
  ) {}

  catalog() {
    return COUNTRIES;
  }

  /** Pesquisa por denominação ou NIF e filtro por estado. */
  async list(org: OrganizationId, filter: { q?: string; status?: "active" | "archived" | "all" } = {}) {
    const q = filter.q?.trim().toLowerCase().replace(/[\s.-]/g, "") ?? "";
    const status = filter.status ?? "active";
    const links = await this.repo.locationLinks(org);
    return (await this.repo.list(org))
      .filter((e) => status === "all" || e.status === status)
      .filter((e) => !q || e.name.toLowerCase().replace(/[\s.-]/g, "").includes(q) || e.taxId.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "pt"))
      .map((e) => ({ ...e, locations: links.filter((l) => l.legalEntityId === e.id).length }));
  }

  private async getOr404(org: OrganizationId, id: string) {
    const e = await this.repo.get(org, id);
    if (!e) throw new LegalEntityError("Entidade legal não encontrada.", "not_found");
    return e;
  }

  private async assertUniqueTaxId(org: OrganizationId, input: LegalEntityInput, selfId: string | null) {
    const other = await this.repo.findByTaxId(org, input.country, input.taxId);
    if (other && other.id !== selfId) throw new LegalEntityError("Já existe uma entidade com esta identificação fiscal.", "conflict", "taxId", { existingId: other.id });
  }

  /** Onde a entidade está a ser usada: centros ativos e contratos em vigor nesses centros. */
  async usage(org: OrganizationId, id: string) {
    await this.getOr404(org, id);
    const active = new Set((await this.ctx.activeLocations(org)).map((l) => l.id));
    const locationIds = (await this.repo.locationLinks(org)).filter((l) => l.legalEntityId === id && active.has(l.locationId)).map((l) => l.locationId);
    return { locations: locationIds.length, contracts: locationIds.length ? await this.ctx.activeContractsAt(org, locationIds) : 0 };
  }

  async create(org: OrganizationId, actor: Actor, input: LegalEntityInput) {
    const clean = validateLegalEntity(input);
    await this.assertUniqueTaxId(org, clean, null);
    const created = await this.repo.create(org, clean, actor.email);
    await this.ctx.audit(org, { actor: actor.email, action: "legal_entities.create", resourceId: created.id, before: null, after: clean, reason: null });
    return created;
  }

  /**
   * Editar: motivo sempre (FE-090). Numa entidade em uso não se muda o país
   * (409 — criar outra) e alterar dados fiscais fica auditado com o uso.
   */
  async update(org: OrganizationId, actor: Actor, id: string, patch: Partial<LegalEntityInput>, reason: string) {
    const cur = await this.getOr404(org, id);
    if (cur.status === "archived") throw new LegalEntityError("Entidade arquivada: reative-a antes de editar.", "conflict");
    if ((reason ?? "").trim().length < MIN_REASON) throw new LegalEntityError(`Indique o motivo (mínimo ${MIN_REASON} caracteres).`, "validation", "reason");
    const { id: _i, status: _s, createdAt: _c, updatedAt: _u, ...base } = cur;
    const next = validateLegalEntity({ ...base, ...patch });
    const use = await this.usage(org, id);
    const inUse = use.locations > 0 || use.contracts > 0;
    if (next.country !== cur.country && inUse) throw new LegalEntityError("Não pode mudar o país de uma entidade com centros ou contratos. Crie uma nova entidade.", "in_use", "country", use);
    if (next.taxId !== cur.taxId || next.country !== cur.country) await this.assertUniqueTaxId(org, next, id);
    const changed = (Object.keys(next) as (keyof LegalEntityInput)[]).filter((k) => next[k] !== base[k]);
    if (!changed.length) return cur;
    const updated = await this.repo.update(org, id, next);
    const fiscal = changed.some((k) => FISCAL_FIELDS.includes(k));
    const before = Object.fromEntries(changed.map((k) => [k, base[k]]));
    const after = Object.fromEntries(changed.map((k) => [k, next[k]]));
    await this.ctx.audit(org, { actor: actor.email, action: fiscal && inUse ? "legal_entities.update_fiscal_in_use" : "legal_entities.update", resourceId: id, before, after: { ...after, ...(fiscal && inUse && { usage: use }) }, reason: reason.trim() });
    return updated;
  }

  /** Arquivar só sem centros ativos nem contratos em vigor (409 com as contagens). */
  async archive(org: OrganizationId, actor: Actor, id: string, reason: string) {
    const cur = await this.getOr404(org, id);
    if (cur.status === "archived") return cur;
    if ((reason ?? "").trim().length < MIN_REASON) throw new LegalEntityError(`Indique o motivo (mínimo ${MIN_REASON} caracteres).`, "validation", "reason");
    const use = await this.usage(org, id);
    if (use.locations > 0 || use.contracts > 0) throw new LegalEntityError("A entidade tem centros ativos ou contratos em vigor.", "in_use", null, use);
    const updated = await this.repo.update(org, id, { status: "archived" });
    await this.ctx.audit(org, { actor: actor.email, action: "legal_entities.archive", resourceId: id, before: { status: "active" }, after: { status: "archived" }, reason: reason.trim() });
    return updated;
  }

  async restore(org: OrganizationId, actor: Actor, id: string) {
    const cur = await this.getOr404(org, id);
    if (cur.status === "active") return cur;
    const updated = await this.repo.update(org, id, { status: "active" });
    await this.ctx.audit(org, { actor: actor.email, action: "legal_entities.restore", resourceId: id, before: { status: "archived" }, after: { status: "active" }, reason: null });
    return updated;
  }

  /** Centros com a entidade de cada um (FE-093). */
  async locations(org: OrganizationId) {
    const links = new Map((await this.repo.locationLinks(org)).map((l) => [l.locationId, l.legalEntityId]));
    return (await this.ctx.activeLocations(org)).map((l) => ({ ...l, legalEntityId: links.get(l.id) ?? null }));
  }

  /** Escolher a entidade de um centro (só entidades ativas). */
  async setLocationEntity(org: OrganizationId, actor: Actor, locationId: string, legalEntityId: string | null) {
    if (!(await this.ctx.activeLocations(org)).some((l) => l.id === locationId)) throw new LegalEntityError("Centro não encontrado.", "not_found");
    if (legalEntityId) {
      const e = await this.getOr404(org, legalEntityId);
      if (e.status !== "active") throw new LegalEntityError("Só se escolhem entidades ativas.", "conflict", "legalEntityId");
    }
    const before = (await this.repo.locationLinks(org)).find((l) => l.locationId === locationId)?.legalEntityId ?? null;
    if (before === legalEntityId) return;
    await this.repo.setLocationEntity(org, locationId, legalEntityId);
    await this.ctx.audit(org, { actor: actor.email, action: "legal_entities.location_link", resourceId: locationId, before: { legalEntityId: before }, after: { legalEntityId }, reason: null });
  }
}

export type LegalEntityWithUsage = LegalEntity & { locations: number };
