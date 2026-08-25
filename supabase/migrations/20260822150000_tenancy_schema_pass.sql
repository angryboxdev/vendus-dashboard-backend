-- The tenancy schema pass: org_id on every table, location_id on the event
-- grain, and the unique constraints that would collide across tenants
-- rewritten to be org-scoped.
--
-- One migration, one transaction (the Supabase CLI wraps each migration file
-- in a transaction already) -- see .scratch/org-location-foundation/spec.md
-- D2-D8 and the "Table inventory" section for the full rationale. Summary:
--
--   * org_id is NOT NULL with a column DEFAULT pointing at the Angrybox org
--     (id 'b6999cff-79b2-4583-b8b4-a744b3ace748', seeded in
--     20260822143602_tenant_root_tables.sql). ADD COLUMN ... NOT NULL DEFAULT
--     <constant> is metadata-only in PG11+, so there is no separate backfill
--     step (D2). The default is scaffolding for the 59 write sites that don't
--     supply org_id yet, and is dropped in spec B (gate item 3).
--   * location_id is NOT NULL, same DEFAULT treatment, on the four event-grain
--     tables (D4): cash_closings, stock_movements, hr_work_shifts,
--     hr_shift_attendance.
--   * location_id is nullable, no default, on invoice_lines -- the allocation
--     grain (D4, D5). Existing rows stay NULL: the org-wide-cost meaning, not
--     "not yet allocated" (D5).
--   * Nine unique constraints get an org_id prefix (D6); two carve-outs are
--     left deliberately alone (D7): hr_employees.kiosk_pin_hash (global
--     kiosk lookup has no org filter yet) and the four CRM text primary keys
--     (restructuring them needs composite FKs, deferred to spec B per D8).
--   * No composite FKs, no (org_id, ...) index rewrites -- both deferred to
--     spec B (D8, gate items 1-2).
--
-- Note on scope vs. the spec's "Table inventory" list: that list enumerates
-- 52 tables and was compiled from docs, not the live schema. Cross-checked
-- against the baseline (20260822141653_remote_schema.sql), actual production
-- has 55 tables besides organizations/locations, not 52 -- four in active use
-- (cost_centers, crm_action_types, crm_customer_actions, payable_entries)
-- are missing from the inventory prose, and one listed table
-- (dre_receita_bruta) does not exist (only in supabase/migrations/_archive/,
-- never applied). This migration follows the mechanical, unconditional rule
-- the ticket's own "Done when" check encodes -- every table except
-- organizations gets org_id -- so it covers the four extra tables and skips
-- the nonexistent one. Flagged here for whoever reconciles spec.md next.

-- =============================================================================
-- 1. org_id on all 55 tables (every table except organizations and locations,
--    which already got it in 20260822143602_tenant_root_tables.sql).
-- =============================================================================

alter table "public"."analytics_monthly_cache"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."app_users"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."bank_accounts"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."bank_movement_entity_links"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."bank_movement_match_hints"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."bank_movements"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."bank_reconciliation_rules"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."bank_statement_imports"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."banks"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."cash_closings"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."channels"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."classification_rules"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."cost_center_categories"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."cost_center_groups"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

-- Not in spec.md's table inventory prose (see header note); covered because
-- it is a real table with real FK dependents and the Done-when check is
-- unconditional.
alter table "public"."cost_centers"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

-- Not in spec.md's table inventory prose (see header note).
alter table "public"."crm_action_types"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."crm_contacts"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

-- Not in spec.md's table inventory prose (see header note).
alter table "public"."crm_customer_actions"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."crm_customer_tags"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."crm_customers"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."crm_orders"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."crm_parameters"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."crm_scripts"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."crm_tags"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."dre_custos_fixos"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."dre_custos_variaveis"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."hr_audit_logs"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."hr_employee_documents"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."hr_employee_payments"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."hr_employees"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."hr_leave_balances"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."hr_leave_requests"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

-- is_national is untouched by this pass -- it stays the discriminator that
-- makes the eventual public_holidays / org_holidays split mechanical.
alter table "public"."hr_public_holidays"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."hr_shift_attendance"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."hr_work_shifts"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."invoice_lines"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."invoices"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

-- Not in spec.md's table inventory prose (see header note); heavily used
-- (payable-entries, payable-recurrences, invoices, bank-statements,
-- financial-obligations modules all read/write it).
alter table "public"."payable_entries"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."pizza_prices"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."pizza_recipe_items"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."pizza_recipes"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."pizzas"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."preparation_items"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."preparations"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."recurring_contracts"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."recurring_occurrences"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."stock_categories"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."stock_items"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."stock_movements"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."supplier_article_mappings"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."supplier_import_hints"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."supplier_invoice_import_lines"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."supplier_invoice_imports"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."suppliers"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

alter table "public"."vendus_product_mapping"
  add column "org_id" uuid not null default 'b6999cff-79b2-4583-b8b4-a744b3ace748' references public.organizations(id);

-- =============================================================================
-- 2. location_id NOT NULL on the event-grain tables (D4). Same DEFAULT
--    treatment as org_id -- none of the write sites supplies one yet.
-- =============================================================================

alter table "public"."cash_closings"
  add column "location_id" uuid not null default 'c11d9146-fe16-4afb-9877-75e75bb2f52a' references public.locations(id);

alter table "public"."stock_movements"
  add column "location_id" uuid not null default 'c11d9146-fe16-4afb-9877-75e75bb2f52a' references public.locations(id);

alter table "public"."hr_work_shifts"
  add column "location_id" uuid not null default 'c11d9146-fe16-4afb-9877-75e75bb2f52a' references public.locations(id);

alter table "public"."hr_shift_attendance"
  add column "location_id" uuid not null default 'c11d9146-fe16-4afb-9877-75e75bb2f52a' references public.locations(id);

-- =============================================================================
-- 3. location_id nullable on invoice_lines (D4, D5). No default -- existing
--    rows stay NULL, meaning the cost belongs to the org and to no single
--    store. Backfilling to Arcozelo would invent an allocation decision no
--    one made.
-- =============================================================================

alter table "public"."invoice_lines"
  add column "location_id" uuid references public.locations(id);

-- =============================================================================
-- 4. Rewrite the colliding unique constraints (D6). Every other constraint
--    keeps its current shape -- their leading columns are already
--    org-determined through a parent that now carries org_id.
-- =============================================================================

alter table "public"."channels"
  drop constraint "channels_code_key";
alter table "public"."channels"
  add constraint "channels_org_id_code_key" unique (org_id, code);

alter table "public"."cost_center_groups"
  drop constraint "cost_center_groups_code_key";
alter table "public"."cost_center_groups"
  add constraint "cost_center_groups_org_id_code_key" unique (org_id, code);

alter table "public"."cost_center_categories"
  drop constraint "cost_center_categories_code_key";
alter table "public"."cost_center_categories"
  add constraint "cost_center_categories_org_id_code_key" unique (org_id, code);

-- Partial unique index (not a table constraint) -- same predicate, org_id
-- prefixed.
drop index "public"."idx_stock_items_sku";
create unique index "idx_stock_items_org_id_sku" on public.stock_items using btree (org_id, sku)
  where ((sku is not null) AND (sku <> ''::text));

alter table "public"."hr_public_holidays"
  drop constraint "hr_public_holidays_date_key";
alter table "public"."hr_public_holidays"
  add constraint "hr_public_holidays_org_id_date_key" unique (org_id, date);

-- Only one unique constraint exists on this table in the live schema
-- (supplier_normalized, stock_item_id). spec.md D6 also names a
-- (supplier_normalized, description_normalized) constraint, but no such
-- constraint exists -- description matching runs through a plain (non-unique)
-- GIN index on supplier_article_description_normalized, untouched here per
-- the "no index rewrites" carve-out (D6, gate item 2).
alter table "public"."supplier_article_mappings"
  drop constraint "supplier_article_mappings_supplier_item_unique";
alter table "public"."supplier_article_mappings"
  add constraint "supplier_article_mappings_org_id_supplier_item_unique" unique (org_id, supplier_normalized, stock_item_id);

alter table "public"."analytics_monthly_cache"
  drop constraint "analytics_monthly_cache_pkey";
alter table "public"."analytics_monthly_cache"
  add constraint "analytics_monthly_cache_pkey" primary key (org_id, year, month);

alter table "public"."bank_movements"
  drop constraint "bank_movements_deduplication_hash_key";
alter table "public"."bank_movements"
  add constraint "bank_movements_org_id_deduplication_hash_key" unique (org_id, deduplication_hash);

alter table "public"."vendus_product_mapping"
  drop constraint "vendus_product_mapping_match_by_match_value_key";
alter table "public"."vendus_product_mapping"
  add constraint "vendus_product_mapping_org_id_match_by_match_value_key" unique (org_id, match_by, match_value);

-- =============================================================================
-- 5. Do NOT touch (D7, D8):
--    - hr_employees.kiosk_pin_hash stays globally unique
--      (hr_employees_kiosk_pin_hash_uq) -- the kiosk lookup has no org filter
--      yet; scoping the index without scoping the lookup opens a cross-tenant
--      auth hole. Deferred as gate item 5.
--    - The four CRM text primary keys (crm_customers.id, crm_parameters.key,
--      crm_scripts.code, crm_tags.name) keep their natural-key shape.
--      Restructuring them needs composite FKs on their children
--      (crm_contacts, crm_orders, crm_customer_tags), deferred to spec B
--      (D8, gate item 1). They still got org_id in section 1 above.
--    - No composite FKs anywhere (D8, gate item 1).
--    - No (org_id, ...) index rewrites beyond the unique constraints above
--      (D6/D8, gate item 2).
-- =============================================================================
