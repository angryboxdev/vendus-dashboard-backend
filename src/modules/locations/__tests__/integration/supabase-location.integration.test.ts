import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { Location } from "../../domain/entities/location.js";
import { DuplicateLocationCodeError } from "../../domain/errors.js";
import type { SupabaseLocationRepository as RepositoryType } from "../../adapters/out/supabase-location.repository.js";

/**
 * Escrita de `locations` contra a stack local da Supabase (`supabase start`
 * + `supabase db reset`) — mesmo setup de `organization`/`cash-closings`.
 * O local criado aqui é removido no fim diretamente pelo client de teste
 * (a aplicação nunca apaga locais).
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

const SEED_ORG_ID = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const UNKNOWN_ORG_ID = mintOrganizationId("00000000-0000-0000-0000-000000000000");
const TEST_LOCATION_ID = "5f0c2a7e-0000-4000-8000-0000000000aa";

let repository: RepositoryType;

beforeAll(async () => {
  const { error } = await localClient.from("locations").select("id").limit(1);
  if (error) {
    throw new Error(
      `Local Supabase stack unreachable at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then \`supabase db reset\`). Underlying error: ${error.message}`,
    );
  }
  const { createScopedQuery } = await import("../../../../infra/scoped-db/scoped-query.js");
  const { SupabaseLocationRepository } = await import("../../adapters/out/supabase-location.repository.js");
  repository = new SupabaseLocationRepository(createScopedQuery as ScopedQueryFactory);
});

afterAll(async () => {
  await localClient.from("locations").delete().eq("id", TEST_LOCATION_ID);
});

describe("SupabaseLocationRepository (escrita)", () => {
  it("insere, atualiza, inativa e relê um local com as colunas novas", async () => {
    const now = new Date();
    const created = Location.create(
      TEST_LOCATION_ID,
      { name: "Armazém Teste", code: "ITEST", address: "Rua de Teste, 1", postalCode: "4000-123", city: "Porto", municipality: "Porto", country: "PT", timezone: "Europe/Lisbon", phone: null },
      now,
    );
    await repository.insert(SEED_ORG_ID, created);
    await repository.update(SEED_ORG_ID, created.update({ phone: "+351 220 000 000" }, now).deactivate(now));

    const reloaded = await repository.findOneForOrganization(SEED_ORG_ID, TEST_LOCATION_ID);
    expect(reloaded).toMatchObject({ code: "ITEST", municipality: "Porto", phone: "+351 220 000 000", isActive: false });
    expect(await repository.findOneForOrganization(UNKNOWN_ORG_ID, TEST_LOCATION_ID)).toBeNull();
  });

  it("traduz a violação de unique (org_id, code) para DuplicateLocationCodeError", async () => {
    const duplicate = Location.create(
      "5f0c2a7e-0000-4000-8000-0000000000bb",
      { name: "Outro", code: "ITEST", address: null, postalCode: null, city: null, municipality: null, country: "PT", timezone: "Europe/Lisbon", phone: null },
      new Date(),
    );
    await expect(repository.insert(SEED_ORG_ID, duplicate)).rejects.toBeInstanceOf(DuplicateLocationCodeError);
  });
});
