import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationId } from "../../kernel/organization-id.js";
import { TABLE_REGISTRY, type TableName } from "./table-registry.js";
import { getSupabaseServiceRole } from "./supabase-client.js";

type Row = Record<string, unknown>;

function stamp<V extends Row | Row[]>(values: V, column: string, organizationId: OrganizationId): V {
  if (Array.isArray(values)) {
    return values.map((row) => ({ ...row, [column]: organizationId })) as V;
  }
  return { ...values, [column]: organizationId } as V;
}

/**
 * The scoped query helper (D1/D2, ADR-0008) — the only new seam this spec
 * introduces. Constructible only from an organization: `ScopedQuery.create`
 * requires an `OrganizationId`, which itself can only come from
 * `mintOrganizationId` (D7), so there is no path to a `ScopedQuery` that
 * isn't scoped to a real organization.
 *
 * `table(name)` returns a small facade over one table. Its verbs return the
 * **native** PostgREST builder from `@supabase/supabase-js`, with the
 * organization filter or stamp already applied — everything downstream
 * (ordering, ranges, counts, `.eq()` on an identifier, `maybeSingle()`, …)
 * keeps working exactly as it does against a raw `.from(table)` call, so a
 * converted call site differs from the original by one identifier (D1's
 * whole thesis). No method here re-implements any of the builder's own
 * chaining methods — the return types are left to flow from the client
 * itself so that stays true; if a future change finds itself hand-rolling
 * one of those methods, the design has gone wrong (spec.md Notes).
 *
 * `name` is typed as `TableName` (the registry's keys), so passing a table
 * the registry doesn't know about is a compile error at the call site, not
 * a runtime failure.
 */
export class ScopedQuery {
  private constructor(
    private readonly organizationId: OrganizationId,
    private readonly client: SupabaseClient,
  ) {}

  /**
   * Low-level constructor taking an explicit client — this is the seam the
   * helper's own unit tests use (a fake/spy `SupabaseClient`), and what
   * `createScopedQuery` below delegates to for real callers.
   */
  static create(organizationId: OrganizationId, client: SupabaseClient): ScopedQuery {
    return new ScopedQuery(organizationId, client);
  }

  /**
   * The one stored procedure in the codebase (D17, ADR-0008):
   * `get_stock_quantities_with_last_purchase` aggregated `stock_movements`
   * for a set of item identifiers with no organization predicate at all, and
   * was executable by anonymous callers — a hole in the "the helper is the
   * only place a query is built" claim regardless of who wrote the function.
   * It now takes an organization argument and filters on it (migration
   * `20260829140000_scope_stock_quantities_rpc.sql`); this method is the only
   * place in `src/**` that may call it, so it cannot be invoked unscoped.
   */
  getStockQuantitiesWithLastPurchase(itemIds: string[]) {
    return this.client.rpc("get_stock_quantities_with_last_purchase", {
      p_org_id: this.organizationId,
      p_item_ids: itemIds,
    });
  }

  table<T extends TableName>(name: T) {
    const entry = TABLE_REGISTRY[name];
    const organizationId = this.organizationId;
    const client = this.client;

    return {
      /**
       * Filtered: the organization predicate is already applied.
       *
       * Typed as a plain `string` rather than mirroring the native
       * `select`'s own `<Query extends string>` generic: threading that
       * generic through this wrapper sends `tsc` into a multi-gigabyte,
       * out-of-memory type-inference blowup across the codebase (the
       * combination of a passthrough generic with `@supabase/supabase-js`'s
       * own literal-parsing `GetResult` machinery). The cost is that the
       * builder's row type falls back to its untyped-client shape instead
       * of being parsed from the column list — callers already cast the
       * result to their own row shape (see e.g. the reference module's
       * repositories), so this loses nothing in practice.
       *
       * `options` forwards straight to the native `select` (`head`/`count`)
       * so a converted call site that only wants a row count — e.g.
       * `.select("id", { count: "exact", head: true })` — keeps working
       * unchanged, per D1's "counts ... keep working unchanged" (bank-accounts,
       * spec B2 ticket 02, was the first converted call site to need this).
       */
      select(columns?: string, options?: { head?: boolean; count?: "exact" | "planned" | "estimated" }) {
        return client
          .from(name)
          .select(columns, options)
          .eq(entry.organizationColumn, organizationId);
      },

      /** Stamped: the organization is written into every row of the body. */
      insert(values: Row | Row[]) {
        return client.from(name).insert(stamp(values, entry.organizationColumn, organizationId));
      },

      /** Stamped, like insert. */
      upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        return client
          .from(name)
          .upsert(stamp(values, entry.organizationColumn, organizationId), options);
      },

      /**
       * Filtered: a subsequent `.eq(<identifier>, …)` on the returned
       * builder composes with the organization predicate (both must match)
       * rather than replacing it — this is what closes identifier-based
       * cross-tenant writes (D1).
       */
      update(values: Row) {
        return client.from(name).update(values).eq(entry.organizationColumn, organizationId);
      },

      /** Filtered, same composition behaviour as update. */
      delete() {
        return client.from(name).delete().eq(entry.organizationColumn, organizationId);
      },
    };
  }
}

/**
 * The factory real call sites use: only an organization to construct. The
 * client is resolved internally (service role — RLS is deferred per
 * ADR-0007, so every existing call site already bypasses it), which is
 * exactly what keeps `@supabase/supabase-js` construction inside this
 * folder.
 */
export function createScopedQuery(organizationId: OrganizationId): ScopedQuery {
  const client = getSupabaseServiceRole();
  if (!client) throw new Error("Supabase service role não configurado");
  return ScopedQuery.create(organizationId, client);
}

/**
 * The shape of `createScopedQuery` — what a module's composition root
 * injects into an adapter's constructor (D2: "Adapters receive a helper
 * factory at composition time and build a scoped helper per invocation").
 * Adapters depend on this function type, not on `createScopedQuery` itself,
 * so a test can inject a fake factory without touching this file.
 */
export type ScopedQueryFactory = (organizationId: OrganizationId) => ScopedQuery;
