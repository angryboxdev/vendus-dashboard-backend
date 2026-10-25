import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { EntryRulesRepositoryPort } from "../../domain/ports/out/entry-rules-repository.port.js";
import type { EntryMode } from "../../domain/services/entry-rules.service.js";

export class FakeEntryRulesRepository implements EntryRulesRepositoryPort {
  byOrg = new Map<string, Record<string, EntryMode>>();
  async list(organizationId: OrganizationId) {
    return { ...(this.byOrg.get(organizationId) ?? {}) };
  }
  async saveAll(organizationId: OrganizationId, rules: Record<string, EntryMode>) {
    this.byOrg.set(organizationId, { ...(this.byOrg.get(organizationId) ?? {}), ...rules });
  }
}
