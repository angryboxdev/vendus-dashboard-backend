# 06 — The tenancy schema pass — one migration

Status: open
Blocked by: 03
Spec: `../spec.md` (D2, D3, D4, D5, D6, D7, table inventory)

## Problem

The core of spec A. Every table needs `org_id`; the event and allocation tables
need `location_id`; the unique constraints that would collide across tenants
need rewriting.

## Shape

**One migration, one transaction.** Either the schema is multi-tenant or it is
not — no intermediate state where half the tables carry `org_id`, which is
§5.2's failure mode.

`ADD COLUMN … NOT NULL DEFAULT <constant>` is **metadata-only** in PG11+ — no
table rewrite, no row-by-row update, instant regardless of size. So there is **no
separate backfill step**: the three-part "add, backfill, then `NOT NULL`" of
phase 3 collapses into one statement per table.

## Work

### 1. `org_id` on all 51 tables (everything except `organizations`)

```sql
alter table <t> add column org_id uuid not null
  default '<angrybox-org-uuid>' references organizations(id);
```

Full list in `../spec.md` § Table inventory. Two notes from there: `app_users`
is included even though spec B replaces it with `org_members`; `hr_public_holidays`
is included, and **`is_national` must survive untouched** — it is what makes the
eventual `public_holidays` / `org_holidays` split mechanical.

### 2. `location_id NOT NULL` on the event tables

`cash_closings`, `stock_movements`, `hr_work_shifts`, `hr_shift_attendance` —
same `DEFAULT` treatment, pointing at the seeded Angrybox location, for the same
reason: none of the 59 write sites supplies one.

### 3. `location_id` nullable on `invoice_lines`

No default. Existing rows stay `NULL` — see D5. `NULL` means the cost belongs to
the organization and to no single store.

### 4. Rewrite the colliding unique constraints

Per the table in `../spec.md` D6: `channels.code`, `cost_center_groups.code`,
`cost_center_categories.code`, `stock_items.sku` (partial index, same predicate),
`hr_public_holidays.date`, `supplier_article_mappings` (both), the
`analytics_monthly_cache` primary key, `bank_movements.deduplication_hash`,
`vendus_product_mapping(match_by, match_value)`.

Leave alone every constraint whose leading columns are already org-determined —
`(recipe_id, stock_item_id, size)`, `(import_id, line_index)`,
`(employee_id, year)`, `(movement_id, entity_id)` and their kin.

### 5. Do NOT touch

- `hr_employees.kiosk_pin_hash` — stays globally unique (D7, gate item 5).
- The four CRM text primary keys — `crm_customers.id`, `crm_parameters.key`,
  `crm_scripts.code`, `crm_tags.name` (D7, gate item 4). They still get `org_id`;
  only their key structure is deferred.
- Foreign keys — they stay single-column (D8, gate item 1).
- Indexes — no `(org_id, …)` rewrites (gate item 2).

## Verification

`supabase db reset` locally, app smoke-tested against it, then
`supabase db diff --linked` before pushing. `db push --dry-run` first.

## Done when

- [x] One migration file, applying in one transaction
      (`supabase/migrations/20260822150000_tenancy_schema_pass.sql`; the
      Supabase CLI wraps each migration file in its own transaction)
- [x] `select table_name from information_schema.tables t where table_schema='public' and not exists (select 1 from information_schema.columns c where c.table_name=t.table_name and c.column_name='org_id')` returns only `organizations`
      (verified after `supabase db reset`)
- [x] The five `location_id` columns exist with the right nullability
      (`cash_closings`, `stock_movements`, `hr_work_shifts`,
      `hr_shift_attendance` NOT NULL; `invoice_lines` nullable — verified via
      `information_schema.columns`)
- [x] `invoice_lines.location_id` is entirely `NULL` (verified: 0/8 seeded rows non-null)
- [x] The nine constraints from D6 are org-scoped; the carve-outs are untouched
      (verified via `pg_constraint`/`pg_indexes` — see note below on one
      discrepancy)
- [x] `supabase db reset` rebuilds from zero (twice — once standalone, once
      again after a concurrently-landed ticket-05 RLS migration appeared,
      confirming the full chain still resets cleanly)

### Notes for whoever reconciles `spec.md` next

- **Table inventory was stale against the live schema.** The baseline
  (`20260822141653_remote_schema.sql`) has 55 tables besides
  `organizations`/`locations`, not the 52 spec.md's "Table inventory" lists.
  Four in active use were missing from that list —
  `cost_centers`, `crm_action_types`, `crm_customer_actions`,
  `payable_entries` (the last is heavily used: payable-entries,
  payable-recurrences, invoices, bank-statements, financial-obligations
  modules) — and one listed table, `dre_receita_bruta`, doesn't exist in
  production (only in `supabase/migrations/_archive/`, never applied). This
  migration followed the ticket's own unconditional Done-when check — every
  table except `organizations` gets `org_id` — so it covers the four extra
  tables and skips the nonexistent one. Full detail in the migration file's
  header comment.
- **D6's `supplier_article_mappings` note is partly stale too.** Only one
  unique constraint exists on that table
  (`supplier_article_mappings_supplier_item_unique` on
  `(supplier_normalized, stock_item_id)`); the second one D6 describes,
  `(supplier_normalized, description_normalized)`, doesn't exist as a unique
  constraint — description matching runs through a plain (non-unique) GIN
  index, left untouched per the no-index-rewrites carve-out.
- Verified against the local stack only — `supabase db diff --linked` and
  `db push --dry-run` (next in the Verification section) were not run; this
  agent has no linked-project credentials in this environment.
- App smoke test was done at the Supabase-client level (service-role
  select/insert against `channels`, `stock_items`, `cash_closings`,
  `invoice_lines`, `payable_entries` — confirming defaults fill in, the
  rewritten `(org_id, code)` constraint rejects a same-org duplicate, and
  `location_id` behaves per D4/D5), not through the HTTP API — a full
  authenticated request against the local stack hit a pre-existing, unrelated
  local GoTrue defect (`relation "identities" does not exist`) in this
  environment's `auth` schema, not something this migration touches.
  Full HTTP-level smoke verification is ticket 08's job.
