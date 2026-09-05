import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Talks to the local Supabase stack directly (`supabase start`), same
 * approach as `location-credentials`' integration test: mocks
 * `supabase-client.js` so `getSupabaseServiceRole()` hands back a client
 * built here against the local stack instead of resolving `ENV`. Everything
 * under test is imported dynamically inside `beforeAll`, after the mock is
 * registered.
 *
 * Asserts against Angrybox's fixed org/location (`unattended-scope.ts`),
 * guaranteed present after `supabase db reset`, using `.some(...)` rather
 * than exact-list equality since the local stack may carry other seeded
 * rows. Read-only — nothing is inserted, so no cleanup is needed.
 */

const LOCAL_SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const localClient: SupabaseClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

jest.mock("../supabase-client.js", () => ({
  getSupabaseServiceRole: () => localClient,
  getSupabase: () => localClient,
  isSupabaseConfigured: () => true,
  isHrSupabaseConfigured: () => true,
}));

const ANGRYBOX_ORG_ID = "b6999cff-79b2-4583-b8b4-a744b3ace748";
const ANGRYBOX_LOCATION_ID = "c11d9146-fe16-4afb-9877-75e75bb2f52a";

let listOrganizations: typeof import("../organization-listing.js").listOrganizations;
let listOrganizationLocationPairs: typeof import("../organization-location-listing.js").listOrganizationLocationPairs;

beforeAll(async () => {
  const { error } = await localClient.from("organizations").select("id").limit(1);
  if (error) {
    throw new Error(
      `Local Supabase stack unreachable at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then \`supabase db reset\`). Underlying error: ${error.message}`,
    );
  }

  ({ listOrganizations } = await import("../organization-listing.js"));
  ({ listOrganizationLocationPairs } = await import("../organization-location-listing.js"));
});

describe("listOrganizations (integration, local Supabase stack)", () => {
  it("lists every organization, including Angrybox's seeded row", async () => {
    const rows = await listOrganizations();

    expect(rows.some((row) => row.organizationId === ANGRYBOX_ORG_ID)).toBe(true);
  });
});

describe("listOrganizationLocationPairs (integration, local Supabase stack)", () => {
  it("lists every (org, location) pair, including Angrybox's seeded pair", async () => {
    const rows = await listOrganizationLocationPairs();

    expect(
      rows.some(
        (row) => row.organizationId === ANGRYBOX_ORG_ID && row.locationId === ANGRYBOX_LOCATION_ID,
      ),
    ).toBe(true);
  });
});
