import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQuery as ScopedQueryType, ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { SupabaseCrmWorkspaceRepository as SupabaseCrmWorkspaceRepositoryType } from "../../adapters/out/supabase-crm-workspace.repository.js";

/**
 * PGRST201 investigation ticket: `crm_customer_actions`' embedded
 * `crm_action_types(name,color)` select is a candidate site. Unlike the
 * other candidates, migration `20260909090000_crm_standalone_parent_
 * composite_pks.sql` drops the plain `crm_customer_actions_action_type_
 * code_fkey`, leaving only the composite
 * `crm_customer_actions_org_id_action_type_code_fkey` — so this embed is
 * expected to resolve unambiguously today. This test exercises
 * `loadDataset()`, `createActions()`, `completeAction()` and
 * `listCustomerActions()` against the real local stack to confirm that
 * empirically rather than by reading the SQL.
 *
 * Setup pattern copied from `location-credentials`' integration test.
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
const ACTION_TYPE_CODE = "CALL";

let scopedQuery: ScopedQueryFactory;
let SupabaseCrmWorkspaceRepository: typeof SupabaseCrmWorkspaceRepositoryType;
let customerId: string;
const createdActionIds: string[] = [];

beforeAll(async () => {
  const { error } = await localClient.from("crm_customer_actions").select("id").limit(1);
  if (error) {
    throw new Error(
      `Local Supabase stack unreachable at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then \`supabase db reset\`). Underlying error: ${error.message}`,
    );
  }

  customerId = `it-customer-${Date.now()}`;
  const { error: customerError } = await localClient.from("crm_customers").insert({
    org_id: ANGRYBOX_ORG_ID,
    id: customerId,
    first_name: "Integration Test Customer",
  });
  if (customerError) throw new Error(`Could not seed a crm_customers row: ${customerError.message}`);

  const scopedQueryModule = (await import("../../../../infra/scoped-db/scoped-query.js")) as {
    ScopedQuery: typeof ScopedQueryType;
  };
  scopedQuery = (organizationId) => scopedQueryModule.ScopedQuery.create(organizationId, localClient);

  ({ SupabaseCrmWorkspaceRepository } = await import(
    "../../adapters/out/supabase-crm-workspace.repository.js"
  ));
});

afterAll(async () => {
  await localClient.from("crm_customers").delete().eq("id", customerId);
});

afterEach(async () => {
  if (createdActionIds.length > 0) {
    await localClient.from("crm_customer_actions").delete().in("id", createdActionIds);
    createdActionIds.length = 0;
  }
});

describe("SupabaseCrmWorkspaceRepository (integration, local Supabase stack)", () => {
  it("loadDataset() embeds crm_action_types without a PGRST201 ambiguity error", async () => {
    const repo = new SupabaseCrmWorkspaceRepository(scopedQuery);
    const [created] = await repo.createActions(ANGRYBOX_ORG_ID, {
      customerIds: [customerId],
      actionTypeCode: ACTION_TYPE_CODE,
      status: "pending",
      scheduledFor: null,
      completedAt: null,
      notes: null,
      scriptCode: null,
      createdBy: null as unknown as string,
    });
    createdActionIds.push(created!.id);

    const dataset = await repo.loadDataset(ANGRYBOX_ORG_ID);

    const found = dataset.actions.find((a) => a.id === created!.id);
    expect(found).toBeDefined();
    expect(found!.actionTypeName).toBe("Ligar");
  });

  it("createActions() embeds crm_action_types without a PGRST201 ambiguity error", async () => {
    const repo = new SupabaseCrmWorkspaceRepository(scopedQuery);

    const [created] = await repo.createActions(ANGRYBOX_ORG_ID, {
      customerIds: [customerId],
      actionTypeCode: ACTION_TYPE_CODE,
      status: "pending",
      scheduledFor: null,
      completedAt: null,
      notes: null,
      scriptCode: null,
      createdBy: null as unknown as string,
    });
    createdActionIds.push(created!.id);

    expect(created!.actionTypeName).toBe("Ligar");
    expect(created!.actionTypeColor).toBe("#2563EB");
  });

  it("completeAction() embeds crm_action_types without a PGRST201 ambiguity error", async () => {
    const repo = new SupabaseCrmWorkspaceRepository(scopedQuery);
    const [created] = await repo.createActions(ANGRYBOX_ORG_ID, {
      customerIds: [customerId],
      actionTypeCode: ACTION_TYPE_CODE,
      status: "pending",
      scheduledFor: null,
      completedAt: null,
      notes: null,
      scriptCode: null,
      createdBy: null as unknown as string,
    });
    createdActionIds.push(created!.id);

    const completed = await repo.completeAction(ANGRYBOX_ORG_ID, created!.id, new Date().toISOString());

    expect(completed.status).toBe("completed");
    expect(completed.actionTypeName).toBe("Ligar");
  });

  it("listCustomerActions() embeds crm_action_types without a PGRST201 ambiguity error", async () => {
    const repo = new SupabaseCrmWorkspaceRepository(scopedQuery);
    const [created] = await repo.createActions(ANGRYBOX_ORG_ID, {
      customerIds: [customerId],
      actionTypeCode: ACTION_TYPE_CODE,
      status: "pending",
      scheduledFor: null,
      completedAt: null,
      notes: null,
      scriptCode: null,
      createdBy: null as unknown as string,
    });
    createdActionIds.push(created!.id);

    const { pending } = await repo.listCustomerActions(ANGRYBOX_ORG_ID, customerId, 10, 0);

    expect(pending).not.toBeNull();
    expect(pending!.id).toBe(created!.id);
    expect(pending!.actionTypeName).toBe("Ligar");
  });
});
