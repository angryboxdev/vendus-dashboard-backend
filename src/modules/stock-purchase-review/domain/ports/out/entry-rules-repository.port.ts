import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { EntryMode } from "../../services/entry-rules.service.js";

/** Regras gravadas pela empresa (`stock_entry_rules`); o que falta usa a predefinição. */
export interface EntryRulesRepositoryPort {
  list(organizationId: OrganizationId): Promise<Partial<Record<string, EntryMode>>>;
  saveAll(organizationId: OrganizationId, rules: Record<string, EntryMode>, actor: string): Promise<void>;
}
