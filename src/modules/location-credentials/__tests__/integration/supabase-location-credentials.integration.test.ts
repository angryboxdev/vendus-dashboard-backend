import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { PairingCode } from "../../domain/entities/pairing-code.js";
import { LocationToken } from "../../domain/entities/location-token.js";
import type { ScopedQuery as ScopedQueryType, ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { SupabasePairingCodeRepository as SupabasePairingCodeRepositoryType } from "../../adapters/out/supabase-pairing-code.repository.js";
import type { SupabaseLocationTokenRepository as SupabaseLocationTokenRepositoryType } from "../../adapters/out/supabase-location-token.repository.js";

/**
 * Integration-test approach (module README: no existing adapter-integration
 * test in this repo to copy from — this is the first one).
 *
 * Talks to the **local** Supabase stack (`supabase start`) directly, never
 * to `ENV`/`.env` (which in this repo currently points at a remote
 * project). `src/infra/scoped-db/supabase-client.ts` is mocked — its
 * `getSupabaseServiceRole()` is what every unscoped door and `ScopedQuery`
 * ultimately call to get a client — so it hands back a client built right
 * here against the local stack, instead of resolving `ENV.SUPABASE_URL`.
 * The URL/key below are the Supabase CLI's fixed local "demo" credentials
 * (identical on every machine running `supabase start` locally, not a
 * secret) — overridable via `TEST_SUPABASE_URL`/
 * `TEST_SUPABASE_SERVICE_ROLE_KEY` for a differently-configured local stack.
 *
 * Everything under test is imported dynamically, inside `beforeAll`, after
 * the mock above is registered — a static top-level `import` of
 * `supabase-client.ts` (transitively, through the repositories) would
 * `require` the real module before the mock takes effect.
 *
 * Seeds against Angrybox's fixed org/location ids (`unattended-scope.ts`) —
 * guaranteed present after `supabase db reset` — rather than inserting a
 * fresh organization/location, since provisioning one is a different
 * module's job (spec B1). Every row this test creates is deleted in
 * `afterEach`, so the test is safe to re-run against the same local stack.
 *
 * `beforeAll` fails loudly (not a silent skip) if the local stack isn't
 * reachable — this repo's convention (D15) is a real database for this one
 * adapter test, so an unreachable stack is a real failure to fix (run
 * `supabase start`), not a condition to pass over quietly.
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

let scopedQuery: ScopedQueryFactory;
let SupabasePairingCodeRepository: typeof SupabasePairingCodeRepositoryType;
let SupabaseLocationTokenRepository: typeof SupabaseLocationTokenRepositoryType;
const createdPairingCodeIds: string[] = [];
const createdTokenIds: string[] = [];

beforeAll(async () => {
  const { error } = await localClient.from("locations").select("id").limit(1);
  if (error) {
    throw new Error(
      `Local Supabase stack unreachable at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then \`supabase db reset\` to apply this ticket's migration). Underlying error: ${error.message}`,
    );
  }

  const scopedQueryModule = (await import("../../../../infra/scoped-db/scoped-query.js")) as {
    ScopedQuery: typeof ScopedQueryType;
  };
  scopedQuery = (organizationId) => scopedQueryModule.ScopedQuery.create(organizationId, localClient);

  ({ SupabasePairingCodeRepository } = await import("../../adapters/out/supabase-pairing-code.repository.js"));
  ({ SupabaseLocationTokenRepository } = await import("../../adapters/out/supabase-location-token.repository.js"));
});

afterEach(async () => {
  if (createdPairingCodeIds.length > 0) {
    await localClient.from("pairing_codes").delete().in("id", createdPairingCodeIds);
    createdPairingCodeIds.length = 0;
  }
  if (createdTokenIds.length > 0) {
    await localClient.from("location_tokens").delete().in("id", createdTokenIds);
    createdTokenIds.length = 0;
  }
});

describe("SupabasePairingCodeRepository (integration, local Supabase stack)", () => {
  it("saves a pairing code and finds it back by its code value, unscoped", async () => {
    const repo = new SupabasePairingCodeRepository(scopedQuery);
    const pairingCode = PairingCode.create({
      organizationId: ANGRYBOX_ORG_ID,
      locationId: ANGRYBOX_LOCATION_ID,
      code: `IT${Date.now()}`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    createdPairingCodeIds.push(pairingCode.id);

    await repo.save(pairingCode);
    const found = await repo.findByCode(pairingCode.code);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(pairingCode.id);
    expect(found!.organizationId).toBe(ANGRYBOX_ORG_ID);
    expect(found!.locationId).toBe(ANGRYBOX_LOCATION_ID);
    expect(found!.isBurned).toBe(false);
  });

  it("persists burn() so a re-saved code comes back burned", async () => {
    const repo = new SupabasePairingCodeRepository(scopedQuery);
    const pairingCode = PairingCode.create({
      organizationId: ANGRYBOX_ORG_ID,
      locationId: ANGRYBOX_LOCATION_ID,
      code: `IT${Date.now()}B`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    createdPairingCodeIds.push(pairingCode.id);
    await repo.save(pairingCode);

    pairingCode.burn(new Date());
    await repo.save(pairingCode);

    const found = await repo.findByCode(pairingCode.code);
    expect(found!.isBurned).toBe(true);
  });

  it("returns null for a code that does not exist", async () => {
    const repo = new SupabasePairingCodeRepository(scopedQuery);
    const found = await repo.findByCode("DOES-NOT-EXIST");
    expect(found).toBeNull();
  });
});

describe("SupabaseLocationTokenRepository (integration, local Supabase stack)", () => {
  it("saves a token and lists it back scoped to its organization and location", async () => {
    const repo = new SupabaseLocationTokenRepository(scopedQuery);
    const token = LocationToken.create({
      organizationId: ANGRYBOX_ORG_ID,
      locationId: ANGRYBOX_LOCATION_ID,
      tokenHash: `hash-${Date.now()}`,
    });
    createdTokenIds.push(token.id);

    await repo.save(token);
    const listed = await repo.listByLocation(ANGRYBOX_ORG_ID, ANGRYBOX_LOCATION_ID);

    expect(listed.some((t) => t.id === token.id)).toBe(true);
  });

  it("revoking one token deletes only that row, leaving a sibling at the same location untouched", async () => {
    const repo = new SupabaseLocationTokenRepository(scopedQuery);
    const toRevoke = LocationToken.create({
      organizationId: ANGRYBOX_ORG_ID,
      locationId: ANGRYBOX_LOCATION_ID,
      tokenHash: `hash-revoke-${Date.now()}`,
    });
    const sibling = LocationToken.create({
      organizationId: ANGRYBOX_ORG_ID,
      locationId: ANGRYBOX_LOCATION_ID,
      tokenHash: `hash-sibling-${Date.now()}`,
    });
    createdTokenIds.push(toRevoke.id, sibling.id);
    await repo.save(toRevoke);
    await repo.save(sibling);

    await repo.deleteById(ANGRYBOX_ORG_ID, toRevoke.id);

    const listed = await repo.listByLocation(ANGRYBOX_ORG_ID, ANGRYBOX_LOCATION_ID);
    expect(listed.some((t) => t.id === toRevoke.id)).toBe(false);
    expect(listed.some((t) => t.id === sibling.id)).toBe(true);
  });

  it("deleteById does not delete a token belonging to a different organization", async () => {
    const repo = new SupabaseLocationTokenRepository(scopedQuery);
    const token = LocationToken.create({
      organizationId: ANGRYBOX_ORG_ID,
      locationId: ANGRYBOX_LOCATION_ID,
      tokenHash: `hash-other-org-${Date.now()}`,
    });
    createdTokenIds.push(token.id);
    await repo.save(token);

    const otherOrgId = mintOrganizationId("00000000-0000-0000-0000-000000000000");
    await repo.deleteById(otherOrgId, token.id);

    const listed = await repo.listByLocation(ANGRYBOX_ORG_ID, ANGRYBOX_LOCATION_ID);
    expect(listed.some((t) => t.id === token.id)).toBe(true);
  });
});
