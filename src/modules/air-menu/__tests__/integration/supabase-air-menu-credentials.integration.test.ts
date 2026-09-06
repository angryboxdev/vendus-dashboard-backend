import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQuery as ScopedQueryType, ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { SupabaseAirMenuCredentialsRepository as SupabaseAirMenuCredentialsRepositoryType } from "../../adapters/out/supabase-air-menu-credentials.repository.js";
import type { SupabaseAirMenuLocationConfigRepository as SupabaseAirMenuLocationConfigRepositoryType } from "../../adapters/out/supabase-air-menu-location-config.repository.js";

/**
 * Integration-test approach copied from `location-credentials`'s own
 * integration test (module README there, D15): talks to the **local**
 * Supabase stack directly, never `ENV`/`.env`. `supabase-client.js` is
 * mocked so `getSupabaseServiceRole()` hands back a client built against the
 * local stack instead of resolving `ENV.SUPABASE_URL`.
 *
 * Seeds against Angrybox's fixed org/location ids (`unattended-scope.ts`).
 * Every row this test creates is deleted in `afterEach`.
 *
 * `beforeAll` fails loudly if the local stack isn't reachable — run
 * `supabase start`, then apply this ticket's migration
 * (`20260905090000_create_airmenu_credentials_tables.sql`), e.g. via
 * `supabase db reset`, before running this test.
 */

const LOCAL_SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const localClient: SupabaseClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

jest.mock("../../../../infra/scoped-db/supabase-client.js", () => ({
  getSupabaseServiceRole: () => localClient,
  getSupabase: () => localClient,
  isSupabaseConfigured: () => true,
  isHrSupabaseConfigured: () => true,
}));

const ANGRYBOX_ORG_ID = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const ANGRYBOX_LOCATION_ID = "c11d9146-fe16-4afb-9877-75e75bb2f52a";
const OTHER_ORG_ID = mintOrganizationId("00000000-0000-0000-0000-000000000000");

let scopedQuery: ScopedQueryFactory;
let SupabaseAirMenuCredentialsRepository: typeof SupabaseAirMenuCredentialsRepositoryType;
let SupabaseAirMenuLocationConfigRepository: typeof SupabaseAirMenuLocationConfigRepositoryType;

beforeAll(async () => {
  const { error } = await localClient.from("airmenu_credentials").select("id").limit(1);
  if (error) {
    throw new Error(
      `Local Supabase stack unreachable/migration not applied at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then \`supabase db reset\` to apply this ticket's migration). Underlying error: ${error.message}`,
    );
  }

  const scopedQueryModule = (await import("../../../../infra/scoped-db/scoped-query.js")) as {
    ScopedQuery: typeof ScopedQueryType;
  };
  scopedQuery = (organizationId) => scopedQueryModule.ScopedQuery.create(organizationId, localClient);

  ({ SupabaseAirMenuCredentialsRepository } = await import(
    "../../adapters/out/supabase-air-menu-credentials.repository.js"
  ));
  ({ SupabaseAirMenuLocationConfigRepository } = await import(
    "../../adapters/out/supabase-air-menu-location-config.repository.js"
  ));
});

afterEach(async () => {
  await localClient.from("airmenu_credentials").delete().eq("org_id", ANGRYBOX_ORG_ID);
  await localClient
    .from("airmenu_location_config")
    .delete()
    .eq("org_id", ANGRYBOX_ORG_ID)
    .eq("location_id", ANGRYBOX_LOCATION_ID);
});

describe("SupabaseAirMenuCredentialsRepository (integration, local Supabase stack)", () => {
  it("write-then-read round-trips correctly through encryption", async () => {
    const repo = new SupabaseAirMenuCredentialsRepository(scopedQuery);
    const credentials = { apiKey: `key-${Date.now()}`, username: "airmenu-user", password: "s3cr3t!" };

    await repo.upsert(ANGRYBOX_ORG_ID, credentials);
    const result = await repo.getByOrganization(ANGRYBOX_ORG_ID);

    expect(result).toEqual({ status: "found", credentials });

    const { data: rawRow } = await localClient
      .from("airmenu_credentials")
      .select("api_key_encrypted, username_encrypted, password_encrypted")
      .eq("org_id", ANGRYBOX_ORG_ID)
      .single();
    expect(rawRow!.api_key_encrypted).not.toBe(credentials.apiKey);
    expect(rawRow!.username_encrypted).not.toBe(credentials.username);
    expect(rawRow!.password_encrypted).not.toBe(credentials.password);
  });

  it("upsert is idempotent — re-running with new values overwrites the same row", async () => {
    const repo = new SupabaseAirMenuCredentialsRepository(scopedQuery);
    await repo.upsert(ANGRYBOX_ORG_ID, { apiKey: "key-1", username: "user-1", password: "pass-1" });
    await repo.upsert(ANGRYBOX_ORG_ID, { apiKey: "key-2", username: "user-2", password: "pass-2" });

    const result = await repo.getByOrganization(ANGRYBOX_ORG_ID);
    expect(result).toEqual({
      status: "found",
      credentials: { apiKey: "key-2", username: "user-2", password: "pass-2" },
    });

    const { count } = await localClient
      .from("airmenu_credentials")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ANGRYBOX_ORG_ID);
    expect(count).toBe(1);
  });

  it("reports not_configured for an organization with no row", async () => {
    const repo = new SupabaseAirMenuCredentialsRepository(scopedQuery);
    const result = await repo.getByOrganization(OTHER_ORG_ID);
    expect(result).toEqual({ status: "not_configured" });
  });
});

describe("SupabaseAirMenuLocationConfigRepository (integration, local Supabase stack)", () => {
  it("write-then-read round-trips the closing enterprise id", async () => {
    const repo = new SupabaseAirMenuLocationConfigRepository(scopedQuery);
    const config = { closingEnterpriseId: `ent-${Date.now()}` };

    await repo.upsert(ANGRYBOX_ORG_ID, ANGRYBOX_LOCATION_ID, config);
    const result = await repo.getByLocation(ANGRYBOX_ORG_ID, ANGRYBOX_LOCATION_ID);

    expect(result).toEqual({ status: "found", config });
  });

  it("reports not_configured for a location with no row", async () => {
    const repo = new SupabaseAirMenuLocationConfigRepository(scopedQuery);
    const result = await repo.getByLocation(OTHER_ORG_ID, "99999999-9999-9999-9999-999999999999");
    expect(result).toEqual({ status: "not_configured" });
  });
});
