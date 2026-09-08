# 04 — Phase 2b: composite FKs — stock & CRM domain

**What to build:** A write naming another organization's stock item, stock
category, CRM customer, CRM tag, CRM contact, or CRM action type is
rejected by the database, not by application code. Add `FOREIGN KEY
(org_id, <col>) REFERENCES <target> (org_id, id)` for every reference into
`stock_items`, `stock_categories`, `crm_customers` (including its own
`referred_by` self-reference), `crm_tags`, `crm_contacts`, and
`crm_action_types` (15 references), built online: `NOT VALID` first,
`VALIDATE CONSTRAINT` after.

**Blocked by:** 01 (ranking/exceptions), 02 (the `UNIQUE (org_id, id)`
indexes these constraints attach to).

**Status:** done

- [x] All 15 references into `stock_items`, `stock_categories`,
      `crm_customers`, `crm_tags`, `crm_contacts`, `crm_action_types` have
      `NOT VALID` composite FKs, then successfully `VALIDATE CONSTRAINT`ed
      (including `crm_customers.referred_by`)
- [x] `supabase db reset` rebuilds the schema from the repository
- [x] Table sizes checked before validating against production-shaped data
      locally
- [x] Smoke check per target table: own-organization write succeeds;
      sibling-organization write rejected with a named foreign-key-violation
      error
- [x] Any reference with no caller-facing write path proven via direct SQL
      insertion instead of HTTP

## Implementation notes

**Migration:** `supabase/migrations/20260908100000_composite_fk_indexes_phase2b.sql`.
Follows phase 1's header style and the constraint-naming precedent already in
the schema (`20260831152632_drop_defaults_and_location_composite_keys.sql`'s
`<table>_org_id_<col>_fkey`). Every one of the 15 references got its own
`ADD CONSTRAINT ... NOT VALID` followed by a separate `VALIDATE CONSTRAINT`
statement, grouped into 6 sections (one per target table). The two
natural-key targets from phase 1 (`crm_action_types(org_id, code)`,
`crm_tags(org_id, name)`) were used as-is, not recreated.

**Source columns verified against the live schema, not just the audit.**
The pre-tenancy baseline (`20260822141653_remote_schema.sql`) defines the 15
source tables in two passes (an early `CREATE TABLE` block, then a later
`ALTER TABLE ... ADD COLUMN` block further down the same 2243-line file that
adds enum-typed columns such as `stock_items.base_unit`/`type`,
`pizzas.category`, `pizza_recipe_items.size`, `stock_movements.type`) — all
15 FK source/nullability claims from ticket 01's audit checked out exactly
against both passes, plus the tenancy migration
(`20260822150000_tenancy_schema_pass.sql`) confirming `org_id uuid not null`
on all 21 tables involved (15 sources + 6 targets). No later migration
touches any of these tables' relevant columns before phase 1.

**Table sizes (local, before validating):** all tiny, as expected for a dev
seed:

| Table | Rows |
|---|---|
| stock_items | 10 |
| stock_categories | 5 |
| stock_movements | 12 |
| supplier_article_mappings | 0 |
| supplier_invoice_import_lines | 0 |
| pizza_recipe_items | 6 |
| preparation_items | 4 |
| vendus_product_mapping | 0 |
| crm_customers | 8 |
| crm_contacts | 5 |
| crm_customer_actions | 5 |
| crm_customer_tags | 7 |
| crm_orders | 0 |
| crm_tags | 6 |
| crm_action_types | 5 |

**`supabase db reset`:** succeeds cleanly, applying all 15 pre-existing
migrations plus this one, then all 5 seed files, with no errors.

Note for whoever runs this next: the local Supabase docker project
(`project_id = "vendus-dashboard-backend"` in `supabase/config.toml`) is
shared across every sibling git-worktree agent (this repo has parallel
worktrees for tickets 03/05/06 etc., all on the same containers/ports).
`supabase db reset` from one worktree wipes whatever another worktree's
in-progress, not-yet-committed migration added, and vice versa. During this
task a concurrent reset from another worktree transiently removed this
migration's constraints from the shared DB between verification passes; the
final state below was captured immediately after this worktree's own reset,
with no other reset in between, and re-confirmed stable afterwards. Running
`db reset`/smoke tests from multiple worktrees at once against the same
local instance isn't safe today.

**Smoke test:** two throwaway orgs (`aaaaaaaa-...0001` / `bbbbbbbb-...0001`)
plus minimal per-org fixtures (locations, stock category/item, pizza +
recipe, preparation, supplier invoice import, CRM customer/tag/action-type/
contact), all inserted and cleaned up via direct SQL against the local DB
(`docker exec` into `supabase_db_vendus-dashboard-backend`, `psql -U
postgres -d postgres`) — used for every one of the 15 references, including
the two the audit tiers "Low" (`vendus_product_mapping.stock_item_id`,
`crm_customer_actions.source_contact_id`, both no caller-facing write path
today). For each reference: an insert naming the *sibling* org's row for
that column (own row's `org_id` otherwise correct) was attempted first,
then the identical insert naming the *caller's own* org's row.

All 15 passed — sibling attempt rejected with the named constraint, own-org
attempt succeeded:

| # | Reference | Sibling-org result | Own-org result |
|---|---|---|---|
| 1 | `stock_movements.item_id` | `violates foreign key constraint "stock_movements_org_id_item_id_fkey"` | `INSERT 0 1` |
| 2 | `supplier_article_mappings.stock_item_id` | `..."supplier_article_mappings_org_id_stock_item_id_fkey"` | `INSERT 0 1` |
| 3 | `supplier_invoice_import_lines.stock_item_id` | `..."supplier_invoice_import_lines_org_id_stock_item_id_fkey"` | `INSERT 0 1` |
| 4 | `pizza_recipe_items.stock_item_id` | `..."pizza_recipe_items_org_id_stock_item_id_fkey"` | `INSERT 0 1` |
| 5 | `preparation_items.stock_item_id` | `..."preparation_items_org_id_stock_item_id_fkey"` | `INSERT 0 1` |
| 6 | `vendus_product_mapping.stock_item_id` (Low tier) | `..."vendus_product_mapping_org_id_stock_item_id_fkey"` | `INSERT 0 1` |
| 7 | `stock_items.category_id` | `..."stock_items_org_id_category_id_fkey"` | `INSERT 0 1` |
| 8 | `crm_customers.referred_by` (self) | `..."crm_customers_org_id_referred_by_fkey"` | `INSERT 0 1` |
| 9 | `crm_contacts.customer_id` | `..."crm_contacts_org_id_customer_id_fkey"` | `INSERT 0 1` |
| 10 | `crm_customer_actions.customer_id` | `..."crm_customer_actions_org_id_customer_id_fkey"` | `INSERT 0 1` |
| 11 | `crm_customer_tags.customer_id` | `..."crm_customer_tags_org_id_customer_id_fkey"` | `INSERT 0 1` |
| 12 | `crm_orders.customer_id` | `..."crm_orders_org_id_customer_id_fkey"` | `INSERT 0 1` |
| 13 | `crm_customer_tags.tag_name` (natural key) | `..."crm_customer_tags_org_id_tag_name_fkey"` | reused #11's own-org row as evidence |
| 14 | `crm_customer_actions.source_contact_id` (Low tier) | `..."crm_customer_actions_org_id_source_contact_id_fkey"` | `INSERT 0 1` |
| 15 | `crm_customer_actions.action_type_code` (natural key) | `..."crm_customer_actions_org_id_action_type_code_fkey"` | reused #10's own-org row as evidence |

Every error message's `DETAIL` line confirmed the exact `(org_id, <col>)`
pair and target table, e.g.:
`DETAIL: Key (org_id, customer_id)=(aaaaaaaa-0000-0000-0000-000000000001, phase2b-cust-b) is not present in table "crm_customers".`

Cleanup: all fixture rows deleted in reverse dependency order (children
before parents, both fake orgs last); verified `organizations` count back to
1 (Angrybox) after cleanup.

**Typecheck:** `npm run typecheck` passes with no errors (migration-only
change, no TS touched).

**Not done, per instructions:** no code-review run, no git commit.
