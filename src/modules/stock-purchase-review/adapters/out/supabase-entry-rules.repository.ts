import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { EntryRulesRepositoryPort } from "../../domain/ports/out/entry-rules-repository.port.js";
import type { EntryMode } from "../../domain/services/entry-rules.service.js";

export class SupabaseEntryRulesRepository implements EntryRulesRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async list(organizationId: OrganizationId): Promise<Partial<Record<string, EntryMode>>> {
    const { data, error } = await this.scopedQuery(organizationId).table("stock_entry_rules").select("item_type, mode");
    if (error) throw new Error(error.message);
    return Object.fromEntries(((data ?? []) as unknown as { item_type: string; mode: EntryMode }[]).map((r) => [r.item_type, r.mode]));
  }

  async saveAll(organizationId: OrganizationId, rules: Record<string, EntryMode>, actor: string): Promise<void> {
    const now = new Date().toISOString();
    const rows = Object.entries(rules).map(([item_type, mode]) => ({ item_type, mode, updated_by: actor, updated_at: now }));
    const { error } = await this.scopedQuery(organizationId).table("stock_entry_rules").upsert(rows, { onConflict: "org_id,item_type" });
    if (error) throw new Error(error.message);
  }
}
