/**
 * The table registry (D1/D10, ADR-0008). One entry per table queried
 * anywhere in the codebase, recording which column carries the organization
 * and whether the table is location-bearing.
 *
 * `TABLE_REGISTRY` is declared `as const`, so `TableName` below is the union
 * of its keys as string literals — passing a table name the registry
 * doesn't know about to `ScopedQuery.table(...)` is a compile error, not a
 * runtime failure. There is no dynamic table name anywhere in the codebase
 * (verified by grep, per spec.md D1), so this types cleanly with no escape
 * hatch.
 *
 * `organizations` is expressed here rather than exempted: its organization
 * key is its own primary key (`id`), so reading one's own organization row
 * is an ordinary scoped query.
 *
 * This list is sourced from `supabase/migrations/20260822150000_tenancy_schema_pass.sql`
 * (55 tables given an `org_id` column there) minus two that migration also
 * covers but this registry doesn't need: `app_users` (dropped outright in
 * `20260825130000_drop_app_users.sql`) and `cost_centers` (still exists, but
 * nothing in `src/` queries it — grep confirms zero `.from("cost_centers")`
 * sites) — plus `organizations`, `locations` and `org_members`, which that
 * migration doesn't touch (they got `org_id`/their own id earlier, in
 * `20260822143602_tenant_root_tables.sql` and
 * `20260825120000_org_members_and_token_hook.sql`). 55 − 2 + 3 = 56 tables,
 * not the 58 the ticket's prose cites.
 *
 * That's independently re-derived here, not a correction spec.md itself
 * makes — spec.md's own "correction to the counts in circulation" section
 * only revisits the 406→371 *call-site* count, not this table count, so
 * don't read this as spec.md backing the 56 figure. The most likely source
 * of the extra two is a naive `.from(` grep over the whole tree catching
 * `Buffer.from("img")` / `Buffer.from("pdf")` in a test fixture as if they
 * were table names — but that's a guess, not a verified cause. What *is*
 * verified: a `.from("...")` grep over `src/` with `Array.from`/`Buffer.from`
 * excluded, and every result is a literal string (no dynamic table name
 * anywhere) — every table it finds has an entry below, and every entry below
 * is queried somewhere in `src/`.
 *
 * Reused twice more, per spec.md's Notes: as the fixture list for this
 * folder's own tests, and as the table-and-key list the eventual org-claim
 * RLS policies are written from.
 */

export interface TableRegistryEntry {
  /** The column on this table that carries the organization. */
  readonly organizationColumn: string;
  /** Whether this table carries a `location_id` (D3: five tables do). */
  readonly locationBearing: boolean;
}

export const TABLE_REGISTRY = {
  // organizations is keyed on its own primary key — see module doc above.
  organizations: { organizationColumn: "id", locationBearing: false },

  locations: { organizationColumn: "org_id", locationBearing: false },
  org_members: { organizationColumn: "org_id", locationBearing: false },

  analytics_monthly_cache: { organizationColumn: "org_id", locationBearing: false },
  bank_accounts: { organizationColumn: "org_id", locationBearing: false },
  bank_movement_entity_links: { organizationColumn: "org_id", locationBearing: false },
  bank_movement_match_hints: { organizationColumn: "org_id", locationBearing: false },
  bank_movements: { organizationColumn: "org_id", locationBearing: false },
  bank_reconciliation_rules: { organizationColumn: "org_id", locationBearing: false },
  bank_statement_imports: { organizationColumn: "org_id", locationBearing: false },
  banks: { organizationColumn: "org_id", locationBearing: false },
  // D3/D4: event-grain table, location_id NOT NULL.
  cash_closings: { organizationColumn: "org_id", locationBearing: true },
  channels: { organizationColumn: "org_id", locationBearing: false },
  classification_rules: { organizationColumn: "org_id", locationBearing: false },
  cost_center_categories: { organizationColumn: "org_id", locationBearing: false },
  cost_center_groups: { organizationColumn: "org_id", locationBearing: false },
  crm_action_types: { organizationColumn: "org_id", locationBearing: false },
  crm_contacts: { organizationColumn: "org_id", locationBearing: false },
  crm_customer_actions: { organizationColumn: "org_id", locationBearing: false },
  crm_customer_tags: { organizationColumn: "org_id", locationBearing: false },
  crm_customers: { organizationColumn: "org_id", locationBearing: false },
  crm_orders: { organizationColumn: "org_id", locationBearing: false },
  crm_parameters: { organizationColumn: "org_id", locationBearing: false },
  crm_scripts: { organizationColumn: "org_id", locationBearing: false },
  crm_tags: { organizationColumn: "org_id", locationBearing: false },
  dre_custos_fixos: { organizationColumn: "org_id", locationBearing: false },
  dre_custos_variaveis: { organizationColumn: "org_id", locationBearing: false },
  hr_audit_logs: { organizationColumn: "org_id", locationBearing: false },
  hr_employee_documents: { organizationColumn: "org_id", locationBearing: false },
  hr_employee_payments: { organizationColumn: "org_id", locationBearing: false },
  hr_employees: { organizationColumn: "org_id", locationBearing: false },
  hr_leave_balances: { organizationColumn: "org_id", locationBearing: false },
  hr_leave_requests: { organizationColumn: "org_id", locationBearing: false },
  hr_public_holidays: { organizationColumn: "org_id", locationBearing: false },
  // D3/D4: event-grain table, location_id NOT NULL.
  hr_shift_attendance: { organizationColumn: "org_id", locationBearing: true },
  // D3/D4: event-grain table, location_id NOT NULL.
  hr_work_shifts: { organizationColumn: "org_id", locationBearing: true },
  // D3/D4/D5: the allocation grain — location_id nullable (org-wide cost vs.
  // allocated to one store), not absent.
  invoice_lines: { organizationColumn: "org_id", locationBearing: true },
  invoices: { organizationColumn: "org_id", locationBearing: false },
  payable_entries: { organizationColumn: "org_id", locationBearing: false },
  pizza_prices: { organizationColumn: "org_id", locationBearing: false },
  pizza_recipe_items: { organizationColumn: "org_id", locationBearing: false },
  pizza_recipes: { organizationColumn: "org_id", locationBearing: false },
  pizzas: { organizationColumn: "org_id", locationBearing: false },
  preparation_items: { organizationColumn: "org_id", locationBearing: false },
  preparations: { organizationColumn: "org_id", locationBearing: false },
  recurring_contracts: { organizationColumn: "org_id", locationBearing: false },
  recurring_occurrences: { organizationColumn: "org_id", locationBearing: false },
  stock_categories: { organizationColumn: "org_id", locationBearing: false },
  stock_items: { organizationColumn: "org_id", locationBearing: false },
  // D3/D4: event-grain table, location_id NOT NULL.
  stock_movements: { organizationColumn: "org_id", locationBearing: true },
  supplier_article_mappings: { organizationColumn: "org_id", locationBearing: false },
  supplier_import_hints: { organizationColumn: "org_id", locationBearing: false },
  supplier_invoice_import_lines: { organizationColumn: "org_id", locationBearing: false },
  supplier_invoice_imports: { organizationColumn: "org_id", locationBearing: false },
  suppliers: { organizationColumn: "org_id", locationBearing: false },
  vendus_product_mapping: { organizationColumn: "org_id", locationBearing: false },
} as const satisfies Record<string, TableRegistryEntry>;

export type TableName = keyof typeof TABLE_REGISTRY;
