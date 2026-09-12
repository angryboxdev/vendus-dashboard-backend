import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId } from "../../kernel/organization-id.js";

/**
 * PGRST201 investigation ticket: `ingredientConsumptionService.ts` embeds
 * `stock_categories(name)` off `stock_items.category_id` at three internal
 * (unexported) call sites (`getStockAdditionsForPeriod`,
 * `getOpeningStockAtPeriodStart`, `buildConsumptionEntriesFromStockMap`),
 * all using the identical select string
 * `"id, name, base_unit, type, category_id, stock_categories(name)"`. Since
 * none of those functions are exported, this test reproduces that exact
 * select through the same `ScopedQuery` facade the service uses
 * (`scoped.table("stock_items").select(...)`) — the PGRST201 ambiguity is a
 * property of the query string against the real schema, not of which
 * wrapper calls it, so this is equivalent to exercising the call sites
 * directly.
 *
 * Setup pattern copied from `location-credentials`' integration test.
 * Read-only against seeded data (`supabase/seeds/03_stock.sql`) — nothing
 * inserted, so no cleanup needed.
 */

const LOCAL_SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const localClient: SupabaseClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

jest.mock("../../infra/scoped-db/supabase-client.js", () => ({
  getSupabaseServiceRole: () => localClient,
  getSupabase: () => localClient,
  isSupabaseConfigured: () => true,
  isHrSupabaseConfigured: () => true,
}));

const ANGRYBOX_ORG_ID = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");

// Exact select string used by the three call sites in ingredientConsumptionService.ts.
const STOCK_ITEMS_SELECT =
  "id, name, base_unit, type, category_id, stock_categories!stock_items_category_id_fkey(name)";

let createScopedQuery: typeof import("../../infra/scoped-db/scoped-query.js").createScopedQuery;
let stockItemId: string;

beforeAll(async () => {
  const { error } = await localClient.from("stock_items").select("id").limit(1);
  if (error) {
    throw new Error(
      `Local Supabase stack unreachable at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then \`supabase db reset\`). Underlying error: ${error.message}`,
    );
  }

  const { data: item, error: itemError } = await localClient
    .from("stock_items")
    .select("id")
    .eq("sku", "ING-FAR-001")
    .single();
  if (itemError || !item) {
    throw new Error(`Could not find seeded stock_items row ING-FAR-001: ${itemError?.message}`);
  }
  stockItemId = item.id as string;

  ({ createScopedQuery } = await import("../../infra/scoped-db/scoped-query.js"));
});

describe("stock_items embed of stock_categories (integration, local Supabase stack)", () => {
  it("resolves stock_categories(name) via .in(id) without a PGRST201 ambiguity error", async () => {
    const scoped = createScopedQuery(ANGRYBOX_ORG_ID);

    const { data, error } = await scoped.table("stock_items").select(STOCK_ITEMS_SELECT).in("id", [stockItemId]);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const row = data![0] as unknown as { stock_categories: { name: string } | { name: string }[] | null };
    const categoryName = Array.isArray(row.stock_categories) ? row.stock_categories[0]?.name : row.stock_categories?.name;
    expect(categoryName).toBe("Massas e Farinhas");
  });
});
