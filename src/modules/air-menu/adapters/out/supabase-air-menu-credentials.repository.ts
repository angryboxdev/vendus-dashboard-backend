import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { decrypt, encrypt } from "../../../../infra/crypto/encryption.js";
import type { AirMenuCredentials } from "../../domain/entities/air-menu-credentials.js";
import type {
  AirMenuCredentialsPort,
  AirMenuCredentialsResult,
} from "../../domain/ports/out/air-menu-credentials.port.js";

/**
 * `getByOrganization` implements the read-only port. `upsert` is additional
 * surface, not part of the port — it exists only so the cutover script
 * (`src/jobs/runAirMenuCredentialsCutover.ts`) writes through this adapter
 * instead of hand-rolling its own Supabase calls, keeping the encryption and
 * column mapping in one place.
 */
export class SupabaseAirMenuCredentialsRepository implements AirMenuCredentialsPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getByOrganization(organizationId: OrganizationId): Promise<AirMenuCredentialsResult> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("airmenu_credentials")
      .select("api_key_encrypted, username_encrypted, password_encrypted")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { status: "not_configured" };

    const row = data as unknown as {
      api_key_encrypted: string;
      username_encrypted: string;
      password_encrypted: string;
    };
    return {
      status: "found",
      credentials: {
        apiKey: decrypt(row.api_key_encrypted),
        username: decrypt(row.username_encrypted),
        password: decrypt(row.password_encrypted),
      },
    };
  }

  async upsert(organizationId: OrganizationId, credentials: AirMenuCredentials): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("airmenu_credentials")
      .upsert(
        {
          api_key_encrypted: encrypt(credentials.apiKey),
          username_encrypted: encrypt(credentials.username),
          password_encrypted: encrypt(credentials.password),
        },
        { onConflict: "org_id" },
      );
    if (error) throw new Error(error.message);
  }
}
