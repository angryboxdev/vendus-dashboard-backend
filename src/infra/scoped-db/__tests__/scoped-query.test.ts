import type { SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId } from "../../../kernel/organization-id.js";
import { ScopedQuery } from "../scoped-query.js";
import { TABLE_REGISTRY } from "../table-registry.js";

/**
 * A fake PostgREST builder recording every call made on it, chaining by
 * always returning itself — matching the shape of the real builder closely
 * enough to assert on "what query would this send" without a database, per
 * spec.md's Testing Decisions: "The PostgREST builder exposes its method,
 * URL and body before any request is made, so these are ordinary fast tests
 * with no database."
 */
interface RecordedFrom {
  table: string;
  selectColumns?: string;
  selectOptions?: unknown;
  insertValues?: unknown;
  upsertValues?: unknown;
  upsertOptions?: unknown;
  updateValues?: unknown;
  deleteCalled: boolean;
  eqCalls: Array<[string, unknown]>;
}

interface RecordedRpc {
  fn: string;
  args: unknown;
}

function fakeSupabaseClient() {
  const froms: RecordedFrom[] = [];
  const rpcs: RecordedRpc[] = [];

  const client = {
    rpc(fn: string, args: unknown) {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: [], error: null });
    },
    from(table: string) {
      const record: RecordedFrom = { table, deleteCalled: false, eqCalls: [] };
      froms.push(record);

      const builder = {
        select(columns?: string, options?: unknown) {
          record.selectColumns = columns;
          record.selectOptions = options;
          return builder;
        },
        insert(values: unknown) {
          record.insertValues = values;
          return builder;
        },
        upsert(values: unknown, options?: unknown) {
          record.upsertValues = values;
          record.upsertOptions = options;
          return builder;
        },
        update(values: unknown) {
          record.updateValues = values;
          return builder;
        },
        delete() {
          record.deleteCalled = true;
          return builder;
        },
        eq(column: string, value: unknown) {
          record.eqCalls.push([column, value]);
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle() {
          return builder;
        },
        single() {
          return builder;
        },
      };
      return builder;
    },
  };

  return { client: client as unknown as SupabaseClient, froms, rpcs };
}

describe("ScopedQuery", () => {
  const orgA = mintOrganizationId("org-a");

  it("a select carries the organization filter", () => {
    const { client, froms } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    scoped.table("stock_items").select("id, name");

    expect(froms).toHaveLength(1);
    expect(froms[0]?.table).toBe("stock_items");
    expect(froms[0]?.selectColumns).toBe("id, name");
    expect(froms[0]?.eqCalls).toEqual([["org_id", "org-a"]]);
  });

  it("a select forwards head/count options to the native builder", () => {
    const { client, froms } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    scoped.table("stock_items").select("id", { count: "exact", head: true });

    expect(froms[0]?.selectOptions).toEqual({ count: "exact", head: true });
  });

  it("an update carries the organization filter and composes with a later identifier filter", () => {
    const { client, froms } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    scoped.table("stock_items").update({ name: "Renamed" }).eq("id", "item-1");

    expect(froms[0]?.updateValues).toEqual({ name: "Renamed" });
    // Both predicates present — the identifier filter composes with (does
    // not replace) the organization filter.
    expect(froms[0]?.eqCalls).toEqual([
      ["org_id", "org-a"],
      ["id", "item-1"],
    ]);
  });

  it("a delete carries the organization filter and composes with a later identifier filter", () => {
    const { client, froms } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    scoped.table("stock_items").delete().eq("id", "item-1");

    expect(froms[0]?.deleteCalled).toBe(true);
    expect(froms[0]?.eqCalls).toEqual([
      ["org_id", "org-a"],
      ["id", "item-1"],
    ]);
  });

  it("an insert body is stamped with the organization", () => {
    const { client, froms } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    scoped.table("stock_items").insert({ name: "New item" });

    expect(froms[0]?.insertValues).toEqual({ name: "New item", org_id: "org-a" });
  });

  it("stamps every row of a bulk insert", () => {
    const { client, froms } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    scoped.table("stock_items").insert([{ name: "A" }, { name: "B" }]);

    expect(froms[0]?.insertValues).toEqual([
      { name: "A", org_id: "org-a" },
      { name: "B", org_id: "org-a" },
    ]);
  });

  it("an upsert body is stamped with the organization", () => {
    const { client, froms } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    scoped.table("stock_items").upsert({ id: "item-1", name: "Upserted" }, { onConflict: "id" });

    expect(froms[0]?.upsertValues).toEqual({ id: "item-1", name: "Upserted", org_id: "org-a" });
    expect(froms[0]?.upsertOptions).toEqual({ onConflict: "id" });
  });

  it("filters a table whose organization key is its own primary key (organizations) on that key", () => {
    const { client, froms } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    scoped.table("organizations").select("id, name");

    expect(froms[0]?.eqCalls).toEqual([["id", "org-a"]]);
  });

  it("stamps organizations' own primary key on insert, not org_id", () => {
    const { client, froms } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    scoped.table("organizations").insert({ name: "New Org" });

    expect(froms[0]?.insertValues).toEqual({ name: "New Org", id: "org-a" });
  });

  it("a table absent from the registry does not compile", () => {
    const { client } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    // @ts-expect-error — "not_a_real_table" is not a key of TABLE_REGISTRY.
    scoped.table("not_a_real_table");
  });

  it("carries every registered table's configured organization column", () => {
    const { client, froms } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    for (const [name, entry] of Object.entries(TABLE_REGISTRY)) {
      scoped.table(name as keyof typeof TABLE_REGISTRY).select();
      const last = froms[froms.length - 1];
      expect(last?.eqCalls).toEqual([[entry.organizationColumn, "org-a"]]);
    }
  });

  it("the stock quantities RPC is called with the organization and item ids", () => {
    const { client, rpcs } = fakeSupabaseClient();
    const scoped = ScopedQuery.create(orgA, client);

    scoped.getStockQuantitiesWithLastPurchase(["item-1", "item-2"]);

    expect(rpcs).toEqual([
      {
        fn: "get_stock_quantities_with_last_purchase",
        args: { p_org_id: "org-a", p_item_ids: ["item-1", "item-2"] },
      },
    ]);
  });

  it("the helper cannot be constructed without an organization", () => {
    const { client } = fakeSupabaseClient();
    // @ts-expect-error — organizationId is required; there is no valid call
    // to ScopedQuery.create that omits it.
    ScopedQuery.create(undefined, client);
  });
});
