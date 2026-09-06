import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { encrypt, decrypt } from "../../../../infra/crypto/encryption.js";
import type {
  VendusCredentialsPort,
  VendusCredentialsResult,
} from "../../domain/ports/out/vendus-credentials.port.js";
import type { VendusCredentials } from "../../domain/entities/vendus-credentials.js";

/**
 * Reads/writes `vendus_credentials` (one row per organization). The API key
 * is encrypted at rest (ticket 01's AES-256-GCM helper, `src/infra/crypto/
 * encryption.ts`) — decrypted on read, encrypted on write; this adapter is
 * the only place in the module that touches ciphertext.
 *
 * Never holds a `SupabaseClient` — receives the scoped-query factory at
 * composition time (D2), same pattern as `SupabaseAnalyticsCacheAdapter`.
 */
export class SupabaseVendusCredentialsAdapter implements VendusCredentialsPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getByOrganization(organizationId: OrganizationId): Promise<VendusCredentialsResult> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("vendus_credentials")
      .select("encrypted_api_key")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { status: "not_configured" };

    const row = data as unknown as Record<string, unknown>;
    return {
      status: "configured",
      credentials: { apiKey: decrypt(row["encrypted_api_key"] as string) },
    };
  }

  async save(organizationId: OrganizationId, credentials: VendusCredentials): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("vendus_credentials")
      .upsert({ encrypted_api_key: encrypt(credentials.apiKey) }, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
  }
}
