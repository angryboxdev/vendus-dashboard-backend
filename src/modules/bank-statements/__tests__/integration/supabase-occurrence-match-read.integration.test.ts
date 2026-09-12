import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQuery as ScopedQueryType, ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { SupabaseOccurrenceMatchReadAdapter as SupabaseOccurrenceMatchReadAdapterType } from "../../adapters/out/supabase-occurrence-match-read.adapter.js";

/**
 * PGRST201 investigation ticket: `recurring_occurrences`'s embedded
 * `recurring_contracts(...)` select is a candidate site — after the phase-2
 * composite-FK migration added `recurring_occurrences_org_id_recurrence_id_fkey`
 * alongside the original `recurring_occurrences_recurrence_id_fkey`, the
 * embed may be ambiguous. This test exercises `search()` and `findByIds()`
 * against the real local stack to find out empirically.
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

let scopedQuery: ScopedQueryFactory;
let SupabaseOccurrenceMatchReadAdapter: typeof SupabaseOccurrenceMatchReadAdapterType;
let recurrenceId: string;
const createdOccurrenceIds: string[] = [];
let createdRecurrence = false;

beforeAll(async () => {
  const { error } = await localClient.from("recurring_occurrences").select("id").limit(1);
  if (error) {
    throw new Error(
      `Local Supabase stack unreachable at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then \`supabase db reset\`). Underlying error: ${error.message}`,
    );
  }

  const { data: contract, error: contractError } = await localClient
    .from("recurring_contracts")
    .insert({
      org_id: ANGRYBOX_ORG_ID,
      name: "IT contract",
      supplier_name: "IT supplier",
      type: "variable_invoice",
      frequency: "monthly",
      estimated_amount_cents: 5000,
      day_of_month: 10,
      start_date: "2026-01-01",
      payment_method: "transfer",
    })
    .select("id")
    .single();
  if (contractError || !contract) {
    throw new Error(`Could not seed a recurring_contracts row: ${contractError?.message}`);
  }
  recurrenceId = contract.id as string;
  createdRecurrence = true;

  const scopedQueryModule = (await import("../../../../infra/scoped-db/scoped-query.js")) as {
    ScopedQuery: typeof ScopedQueryType;
  };
  scopedQuery = (organizationId) => scopedQueryModule.ScopedQuery.create(organizationId, localClient);

  ({ SupabaseOccurrenceMatchReadAdapter } = await import(
    "../../adapters/out/supabase-occurrence-match-read.adapter.js"
  ));
});

afterAll(async () => {
  if (createdRecurrence) {
    await localClient.from("recurring_contracts").delete().eq("id", recurrenceId);
  }
});

afterEach(async () => {
  if (createdOccurrenceIds.length > 0) {
    await localClient.from("recurring_occurrences").delete().in("id", createdOccurrenceIds);
    createdOccurrenceIds.length = 0;
  }
});

async function seedOccurrence(dueDate: string) {
  const { data, error } = await localClient
    .from("recurring_occurrences")
    .insert({
      org_id: ANGRYBOX_ORG_ID,
      recurrence_id: recurrenceId,
      period: dueDate.slice(0, 7),
      estimated_amount_cents: 5000,
      due_date: dueDate,
      status: "forecast",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not seed a recurring_occurrences row: ${error?.message}`);
  return data.id as string;
}

describe("SupabaseOccurrenceMatchReadAdapter (integration, local Supabase stack)", () => {
  it("search() embeds recurring_contracts without a PGRST201 ambiguity error", async () => {
    const occurrenceId = await seedOccurrence("2026-02-10");
    createdOccurrenceIds.push(occurrenceId);
    const adapter = new SupabaseOccurrenceMatchReadAdapter(scopedQuery);

    const results = await adapter.search(ANGRYBOX_ORG_ID, {});

    const found = results.find((r) => r.id === occurrenceId);
    expect(found).toBeDefined();
    expect(found!.recurrenceName).toBe("IT contract");
    expect(found!.supplierName).toBe("IT supplier");
  });

  it("findByIds() embeds recurring_contracts without a PGRST201 ambiguity error", async () => {
    const occurrenceId = await seedOccurrence("2026-02-11");
    createdOccurrenceIds.push(occurrenceId);
    const adapter = new SupabaseOccurrenceMatchReadAdapter(scopedQuery);

    const results = await adapter.findByIds(ANGRYBOX_ORG_ID, [occurrenceId]);

    expect(results).toHaveLength(1);
    expect(results[0]!.recurrenceName).toBe("IT contract");
  });
});
