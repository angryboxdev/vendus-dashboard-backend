import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationIdentityReadPort } from "../../domain/ports/out/organization-identity-read.port.js";

/**
 * Cross-module read: accesses the `organizations` table directly instead of
 * depending on the financial-base module (D10 — this stays inside the
 * `invoices` module, no code imported from `financial-base`). Never guards a
 * `SupabaseClient` — receives the `ScopedQueryFactory` and builds a scoped
 * helper per call (D2), same as `SupabaseSupplierLookupAdapter`.
 */
export class SupabaseOrganizationIdentityReadAdapter implements OrganizationIdentityReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getNif(organizationId: OrganizationId): Promise<string | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("organizations")
      .select("nif")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { nif: string | null } | null)?.nif ?? null;
  }
}
