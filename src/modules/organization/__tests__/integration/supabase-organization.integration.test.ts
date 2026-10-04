import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { SupabaseOrganizationProfileRepository as RepositoryType } from "../../adapters/out/supabase-organization-profile.repository.js";
import type { SupabaseOrganizationAuditLogAdapter as AuditType } from "../../adapters/out/supabase-organization-audit-log.adapter.js";

/**
 * Adapters do módulo `organization` contra a stack local da Supabase
 * (`supabase start` + `supabase db reset`) — mesmo setup de
 * `cash-closings`/`location-credentials`: mock de `supabase-client.js` e
 * imports dinâmicos depois do mock. Repõe o perfil original no fim.
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

let scopedQuery: ScopedQueryFactory;
let repository: RepositoryType;
let auditLog: AuditType;
let originalRow: Record<string, unknown>;

beforeAll(async () => {
  const { data, error } = await localClient.from("organizations").select("*").eq("id", SEED_ORG_ID).single();
  if (error) {
    throw new Error(
      `Local Supabase stack unreachable at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then \`supabase db reset\`). Underlying error: ${error.message}`,
    );
  }
  originalRow = data as Record<string, unknown>;

  ({ createScopedQuery: scopedQuery } = await import("../../../../infra/scoped-db/scoped-query.js"));
  const { SupabaseOrganizationProfileRepository } = await import("../../adapters/out/supabase-organization-profile.repository.js");
  const { SupabaseOrganizationAuditLogAdapter } = await import("../../adapters/out/supabase-organization-audit-log.adapter.js");
  repository = new SupabaseOrganizationProfileRepository(scopedQuery);
  auditLog = new SupabaseOrganizationAuditLogAdapter(scopedQuery);
});

afterAll(async () => {
  await localClient.from("organization_audit_logs").delete().eq("org_id", SEED_ORG_ID).eq("actor", "integration-test");
  const { id: _id, created_at: _createdAt, ...restorable } = originalRow;
  await localClient.from("organizations").update(restorable).eq("id", SEED_ORG_ID);
});

describe("SupabaseOrganizationProfileRepository", () => {
  it("lê, grava e relê as colunas novas do perfil", async () => {
    const profile = await repository.findById(SEED_ORG_ID);
    expect(profile).not.toBeNull();

    const updated = profile!.update(
      { legalName: "Exemplo Integração, Lda", postalCode: "4000-123", city: "Porto", phone: "+351 220 000 000" },
      new Date(),
    );
    await repository.save(SEED_ORG_ID, updated);

    const reloaded = (await repository.findById(SEED_ORG_ID))!.toProps();
    expect(reloaded.legalName).toBe("Exemplo Integração, Lda");
    expect(reloaded.postalCode).toBe("4000-123");
    expect(reloaded.country).toBe("PT");
    expect(reloaded.timezone).toBe("Europe/Lisbon");
    expect(reloaded.status).toBe("active");
  });

  it("nunca devolve a organização de outro tenant", async () => {
    expect(await repository.findById(UNKNOWN_ORG_ID)).toBeNull();
  });
});

describe("SupabaseOrganizationAuditLogAdapter", () => {
  it("regista e lista entradas pela entidade", async () => {
    await auditLog.record({
      organizationId: SEED_ORG_ID,
      actor: "integration-test",
      entityType: "organization",
      entityId: SEED_ORG_ID,
      action: "update",
      before: { city: null },
      after: { city: "Porto" },
    });

    const history = await auditLog.findByEntityId(SEED_ORG_ID, SEED_ORG_ID);
    expect(history.some((h) => h.actor === "integration-test" && h.action === "update")).toBe(true);
  });
});
