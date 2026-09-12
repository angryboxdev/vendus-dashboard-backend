import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId } from "../../kernel/organization-id.js";

/**
 * PGRST201 investigation ticket: `stockMovementService.ts`'s
 * `MOVEMENT_HISTORY_SELECT` (module-private constant, ~line 188) embeds
 * `stock_movements.item_id → stock_items` and, nested inside that,
 * `stock_items.category_id → stock_categories`. `MOVEMENT_HISTORY_SELECT`
 * itself isn't exported, so this test reproduces its exact select string
 * through the same `ScopedQuery` facade the service uses
 * (`scoped.table("stock_movements").select(...)`) — the PGRST201 ambiguity
 * is a property of the query string against the real schema, not of which
 * wrapper calls it, so this is equivalent to exercising `listStockMovements
 * Paginated` directly.
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

// Exact select string from stockMovementService.ts's MOVEMENT_HISTORY_SELECT.
const MOVEMENT_HISTORY_SELECT = `
  id,
  item_id,
  type,
  quantity,
  unit_cost_per_base_unit_with_vat,
  unit_cost_per_base_unit_without_vat,
  reason,
  reference,
  movement_date,
  created_at,
  created_by,
  stock_items!stock_movements_item_id_fkey (
    name,
    sku,
    base_unit,
    category_id,
    stock_categories!stock_items_category_id_fkey ( id, name )
  )
`;

let createScopedQuery: typeof import("../../infra/scoped-db/scoped-query.js").createScopedQuery;

beforeAll(async () => {
  const { error } = await localClient.from("stock_movements").select("id").limit(1);
  if (error) {
    throw new Error(
      `Local Supabase stack unreachable at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then \`supabase db reset\`). Underlying error: ${error.message}`,
    );
  }

  ({ createScopedQuery } = await import("../../infra/scoped-db/scoped-query.js"));
});

describe("stock_movements nested embed of stock_items/stock_categories (integration, local Supabase stack)", () => {
  it("resolves the nested stock_items -> stock_categories embed without a PGRST201 ambiguity error", async () => {
    const scoped = createScopedQuery(ANGRYBOX_ORG_ID);

    const { data, error } = await scoped
      .table("stock_movements")
      .select(MOVEMENT_HISTORY_SELECT, { count: "exact" })
      .order("movement_date", { ascending: false })
      .limit(5);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    const row = data![0] as unknown as {
      stock_items: { name: string; stock_categories: { id: string; name: string } | { id: string; name: string }[] | null } | null;
    };
    expect(row.stock_items).not.toBeNull();
  });
});
