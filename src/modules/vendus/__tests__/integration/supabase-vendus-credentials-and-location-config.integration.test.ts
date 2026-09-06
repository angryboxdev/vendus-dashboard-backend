import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQuery as ScopedQueryType, ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { SupabaseVendusCredentialsAdapter as SupabaseVendusCredentialsAdapterType } from "../../adapters/out/supabase-vendus-credentials.adapter.js";
import type { SupabaseVendusLocationConfigAdapter as SupabaseVendusLocationConfigAdapterType } from "../../adapters/out/supabase-vendus-location-config.adapter.js";

/**
 * Talks to the **local** Supabase stack directly, same approach as
 * `location-credentials`' integration test (module README there: the first
 * adapter-integration test in this repo, this is the second). Mocks
 * `supabase-client.js` so `getSupabaseServiceRole()` hands back a client
 * built against the local stack instead of resolving `ENV`. Everything under
 * test is imported dynamically, inside `beforeAll`, after the mock is
 * registered.
 *
 * Seeds against Angrybox's fixed org/location ids (`unattended-scope.ts`) —
 * both tables are one-row-per-org(+location), so each round-trip test
 * deletes its row in `afterEach`, leaving the fixture clean for the next
 * run and for the cutover script's own (separate) writes.
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
const NONEXISTENT_ORG_ID = mintOrganizationId("00000000-0000-0000-0000-000000000000");
const NONEXISTENT_LOCATION_ID = "00000000-0000-0000-0000-000000000001";

let scopedQuery: ScopedQueryFactory;
let SupabaseVendusCredentialsAdapter: typeof SupabaseVendusCredentialsAdapterType;
let SupabaseVendusLocationConfigAdapter: typeof SupabaseVendusLocationConfigAdapterType;

beforeAll(async () => {
  const { error } = await localClient.from("organizations").select("id").limit(1);
  if (error) {
    throw new Error(
      `Local Supabase stack unreachable at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then apply this ticket's migration). Underlying error: ${error.message}`,
    );
  }

  const scopedQueryModule = (await import("../../../../infra/scoped-db/scoped-query.js")) as {
    ScopedQuery: typeof ScopedQueryType;
  };
  scopedQuery = (organizationId) => scopedQueryModule.ScopedQuery.create(organizationId, localClient);

  ({ SupabaseVendusCredentialsAdapter } = await import("../../adapters/out/supabase-vendus-credentials.adapter.js"));
  ({ SupabaseVendusLocationConfigAdapter } = await import(
    "../../adapters/out/supabase-vendus-location-config.adapter.js"
  ));
});

afterEach(async () => {
  await localClient.from("vendus_credentials").delete().eq("org_id", ANGRYBOX_ORG_ID);
  await localClient
    .from("vendus_location_config")
    .delete()
    .eq("org_id", ANGRYBOX_ORG_ID)
    .eq("location_id", ANGRYBOX_LOCATION_ID);
});

describe("SupabaseVendusCredentialsAdapter (integration, local Supabase stack)", () => {
  it("saves an api key and reads it back decrypted", async () => {
    const adapter = new SupabaseVendusCredentialsAdapter(scopedQuery);

    await adapter.save(ANGRYBOX_ORG_ID, { apiKey: "plain-text-api-key" });
    const result = await adapter.getByOrganization(ANGRYBOX_ORG_ID);

    expect(result).toEqual({ status: "configured", credentials: { apiKey: "plain-text-api-key" } });
  });

  it("stores the api key encrypted, not in plain text", async () => {
    const adapter = new SupabaseVendusCredentialsAdapter(scopedQuery);
    await adapter.save(ANGRYBOX_ORG_ID, { apiKey: "plain-text-api-key" });

    const { data } = await localClient
      .from("vendus_credentials")
      .select("encrypted_api_key")
      .eq("org_id", ANGRYBOX_ORG_ID)
      .single();

    expect(data!.encrypted_api_key).not.toBe("plain-text-api-key");
  });

  it("reports not-configured for an organization with no row", async () => {
    const adapter = new SupabaseVendusCredentialsAdapter(scopedQuery);

    const result = await adapter.getByOrganization(NONEXISTENT_ORG_ID);

    expect(result).toEqual({ status: "not_configured" });
  });
});

describe("SupabaseVendusLocationConfigAdapter (integration, local Supabase stack)", () => {
  const config = {
    registerId: "reg-123",
    eatzPaymentId: 111,
    appsPaymentId: 222,
    salaoPriceGroupId: 333,
    eatzPriceGroupId: 444,
  };

  it("saves a location config and reads it back", async () => {
    const adapter = new SupabaseVendusLocationConfigAdapter(scopedQuery);

    await adapter.save(ANGRYBOX_ORG_ID, ANGRYBOX_LOCATION_ID, config);
    const result = await adapter.getByOrganizationAndLocation(ANGRYBOX_ORG_ID, ANGRYBOX_LOCATION_ID);

    expect(result).toEqual({ status: "configured", config });
  });

  it("reports not-configured for a location with no row", async () => {
    const adapter = new SupabaseVendusLocationConfigAdapter(scopedQuery);

    const result = await adapter.getByOrganizationAndLocation(ANGRYBOX_ORG_ID, NONEXISTENT_LOCATION_ID);

    expect(result).toEqual({ status: "not_configured" });
  });
});
