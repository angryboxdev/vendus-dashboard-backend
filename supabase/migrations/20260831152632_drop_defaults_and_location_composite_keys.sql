-- Drop both scaffold column-default families and add the location composite
-- keys. See .scratch/scoped-access/spec.md D3, D5, D11, D12 and ADR-0009 for
-- the full rationale. Summary:
--
--   * The org_id column default (20260822150000_tenancy_schema_pass.sql) was
--     scaffolding that let a half-migrated system keep working: an
--     unconverted write still got stamped with the Angrybox org. Every write
--     path now supplies an organization explicitly (tickets 02-18) and the
--     dependency-cruiser rule that enforces it is at `error` (ticket 20), so
--     the scaffold is the last thing making an unscoped write possible.
--     Dropping it is the contract step -- afterwards a write naming no
--     organization fails at the database, not silently at Angrybox (D12).
--   * The location_id column default on the four event-grain tables
--     (cash_closings, stock_movements, hr_work_shifts, hr_shift_attendance)
--     is dropped in the same migration, not a later one. Dropping only the
--     org_id default would let a second organization's first write land with
--     location_id still pointing at Angrybox's seeded location -- a row
--     belonging to one tenant and referencing another's location, with
--     nothing yet in place to catch it (D3).
--   * The location uniqueness constraint and the five composite foreign keys
--     are what catches it: locations gets a uniqueness constraint on
--     (org_id, id), and each of the five location-bearing tables gets a
--     composite FK to it. A caller-supplied location is an authorization
--     input; this makes "the caller named another organization's store" a
--     foreign key violation instead of a rule every call site (including the
--     cron and kiosk writers, which never see a request at all) has to
--     remember to check (D5). This pulls part of spec A's deferred
--     composite-FK item forward, deliberately and narrowly: the location
--     foreign keys only -- the other 65 stay behind the gate (see the
--     register, rewritten by ticket 20).
--
-- Precondition (not enforced by this migration -- see the deploy runbook):
-- the front end must already be sending a location on every write to the
-- five location-bearing tables (ticket 19) before this runs against
-- production. Getting that order wrong breaks every stock, shift and
-- attendance write at once.

-- =============================================================================
-- 1. Drop the org_id column default on every table that carries one (54
--    tables -- the 55 spec A touched, minus app_users, dropped in
--    20260825130000_drop_app_users.sql along with the org_id column it had
--    received).
-- =============================================================================

alter table "public"."analytics_monthly_cache" alter column "org_id" drop default;
alter table "public"."bank_accounts" alter column "org_id" drop default;
alter table "public"."bank_movement_entity_links" alter column "org_id" drop default;
alter table "public"."bank_movement_match_hints" alter column "org_id" drop default;
alter table "public"."bank_movements" alter column "org_id" drop default;
alter table "public"."bank_reconciliation_rules" alter column "org_id" drop default;
alter table "public"."bank_statement_imports" alter column "org_id" drop default;
alter table "public"."banks" alter column "org_id" drop default;
alter table "public"."cash_closings" alter column "org_id" drop default;
alter table "public"."channels" alter column "org_id" drop default;
alter table "public"."classification_rules" alter column "org_id" drop default;
alter table "public"."cost_center_categories" alter column "org_id" drop default;
alter table "public"."cost_center_groups" alter column "org_id" drop default;
alter table "public"."cost_centers" alter column "org_id" drop default;
alter table "public"."crm_action_types" alter column "org_id" drop default;
alter table "public"."crm_contacts" alter column "org_id" drop default;
alter table "public"."crm_customer_actions" alter column "org_id" drop default;
alter table "public"."crm_customer_tags" alter column "org_id" drop default;
alter table "public"."crm_customers" alter column "org_id" drop default;
alter table "public"."crm_orders" alter column "org_id" drop default;
alter table "public"."crm_parameters" alter column "org_id" drop default;
alter table "public"."crm_scripts" alter column "org_id" drop default;
alter table "public"."crm_tags" alter column "org_id" drop default;
alter table "public"."dre_custos_fixos" alter column "org_id" drop default;
alter table "public"."dre_custos_variaveis" alter column "org_id" drop default;
alter table "public"."hr_audit_logs" alter column "org_id" drop default;
alter table "public"."hr_employee_documents" alter column "org_id" drop default;
alter table "public"."hr_employee_payments" alter column "org_id" drop default;
alter table "public"."hr_employees" alter column "org_id" drop default;
alter table "public"."hr_leave_balances" alter column "org_id" drop default;
alter table "public"."hr_leave_requests" alter column "org_id" drop default;
alter table "public"."hr_public_holidays" alter column "org_id" drop default;
alter table "public"."hr_shift_attendance" alter column "org_id" drop default;
alter table "public"."hr_work_shifts" alter column "org_id" drop default;
alter table "public"."invoice_lines" alter column "org_id" drop default;
alter table "public"."invoices" alter column "org_id" drop default;
alter table "public"."payable_entries" alter column "org_id" drop default;
alter table "public"."pizza_prices" alter column "org_id" drop default;
alter table "public"."pizza_recipe_items" alter column "org_id" drop default;
alter table "public"."pizza_recipes" alter column "org_id" drop default;
alter table "public"."pizzas" alter column "org_id" drop default;
alter table "public"."preparation_items" alter column "org_id" drop default;
alter table "public"."preparations" alter column "org_id" drop default;
alter table "public"."recurring_contracts" alter column "org_id" drop default;
alter table "public"."recurring_occurrences" alter column "org_id" drop default;
alter table "public"."stock_categories" alter column "org_id" drop default;
alter table "public"."stock_items" alter column "org_id" drop default;
alter table "public"."stock_movements" alter column "org_id" drop default;
alter table "public"."supplier_article_mappings" alter column "org_id" drop default;
alter table "public"."supplier_import_hints" alter column "org_id" drop default;
alter table "public"."supplier_invoice_import_lines" alter column "org_id" drop default;
alter table "public"."supplier_invoice_imports" alter column "org_id" drop default;
alter table "public"."suppliers" alter column "org_id" drop default;
alter table "public"."vendus_product_mapping" alter column "org_id" drop default;

-- =============================================================================
-- 2. Drop the location_id column default on the four event-grain tables
--    (D3). invoice_lines' location_id was never given a default -- it is
--    nullable, optional allocation input (D4) -- so it is untouched here.
-- =============================================================================

alter table "public"."cash_closings" alter column "location_id" drop default;
alter table "public"."stock_movements" alter column "location_id" drop default;
alter table "public"."hr_work_shifts" alter column "location_id" drop default;
alter table "public"."hr_shift_attendance" alter column "location_id" drop default;

-- =============================================================================
-- 3. The location uniqueness constraint and the five composite foreign keys
--    (D5). locations.id is already the primary key; a composite unique on
--    (org_id, id) is the standard way to make it referenceable from a
--    composite child key without changing its meaning as an identifier.
-- =============================================================================

alter table "public"."locations"
  add constraint "locations_org_id_id_key" unique (org_id, id);

alter table "public"."cash_closings"
  add constraint "cash_closings_org_id_location_id_fkey"
  foreign key (org_id, location_id) references public.locations (org_id, id);

alter table "public"."stock_movements"
  add constraint "stock_movements_org_id_location_id_fkey"
  foreign key (org_id, location_id) references public.locations (org_id, id);

alter table "public"."hr_work_shifts"
  add constraint "hr_work_shifts_org_id_location_id_fkey"
  foreign key (org_id, location_id) references public.locations (org_id, id);

alter table "public"."hr_shift_attendance"
  add constraint "hr_shift_attendance_org_id_location_id_fkey"
  foreign key (org_id, location_id) references public.locations (org_id, id);

-- invoice_lines.location_id is nullable (D4); a composite FK is still valid
-- here -- MATCH SIMPLE (the default) skips the check when any referencing
-- column is NULL, so an unallocated line stays unaffected.
alter table "public"."invoice_lines"
  add constraint "invoice_lines_org_id_location_id_fkey"
  foreign key (org_id, location_id) references public.locations (org_id, id);
