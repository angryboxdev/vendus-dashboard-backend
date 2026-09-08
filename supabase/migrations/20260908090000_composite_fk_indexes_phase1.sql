-- Composite-FK indexes, phase 1 (`.scratch/composite-fk-indexes/issues/02-phase1-composite-indexes.md`).
-- Builds every `(org_id, ...)` index phase 2's composite foreign keys need,
-- all `CREATE [UNIQUE] INDEX CONCURRENTLY` so nothing locks a table with
-- real data. This migration changes nothing about what a write is allowed
-- to do -- it only gives the planner (and phase 2's future FK targets)
-- indexes to use. See ticket 01's audit for the full candidate list and the
-- ranked FK inventory this feeds.
--
-- CONCURRENTLY-in-a-transaction: verified empirically against the installed
-- CLI (npx supabase 2.117.0) that `supabase db reset` does NOT wrap this
-- file's statements in one enclosing transaction block -- a throwaway
-- migration containing only `create index concurrently ...` statements
-- applied cleanly via `supabase db reset`, and the resulting index showed
-- `indisvalid = true` in pg_index. No workaround (manual psql run +
-- `db pull`/`db diff` reconciliation) is needed; this file runs like any
-- other migration. Multiple CONCURRENTLY statements in the same file were
-- also verified to apply cleanly, one after another.
--
-- Two of the ~24 target tables from the ticket have no `id` column to build
-- `UNIQUE (org_id, id)` on -- `crm_action_types` and `crm_tags` are keyed by
-- a natural text key (`code`, `name`) instead, and that's what the existing
-- FKs into them reference (`crm_customer_actions.action_type_code`,
-- `crm_customer_tags.tag_name` -- see ticket 01's audit). Adjusted to
-- `UNIQUE (org_id, code)` / `UNIQUE (org_id, name)` accordingly, so phase 2
-- can attach the matching composite FK. `hr_employees_kiosk_pin_hash_uq` is
-- untouched, per the ticket.

-- =============================================================================
-- 1. UNIQUE (org_id, id) -- phase-2 composite-FK targets (24 tables)
-- =============================================================================

create unique index concurrently "suppliers_org_id_id_uq"
  on "public"."suppliers" ("org_id", "id");

create unique index concurrently "cost_center_categories_org_id_id_uq"
  on "public"."cost_center_categories" ("org_id", "id");

create unique index concurrently "cost_center_groups_org_id_id_uq"
  on "public"."cost_center_groups" ("org_id", "id");

create unique index concurrently "stock_items_org_id_id_uq"
  on "public"."stock_items" ("org_id", "id");

create unique index concurrently "crm_customers_org_id_id_uq"
  on "public"."crm_customers" ("org_id", "id");

create unique index concurrently "hr_employees_org_id_id_uq"
  on "public"."hr_employees" ("org_id", "id");

create unique index concurrently "bank_accounts_org_id_id_uq"
  on "public"."bank_accounts" ("org_id", "id");

create unique index concurrently "invoices_org_id_id_uq"
  on "public"."invoices" ("org_id", "id");

create unique index concurrently "pizzas_org_id_id_uq"
  on "public"."pizzas" ("org_id", "id");

create unique index concurrently "channels_org_id_id_uq"
  on "public"."channels" ("org_id", "id");

create unique index concurrently "cost_centers_org_id_id_uq"
  on "public"."cost_centers" ("org_id", "id");

create unique index concurrently "preparations_org_id_id_uq"
  on "public"."preparations" ("org_id", "id");

create unique index concurrently "supplier_invoice_imports_org_id_id_uq"
  on "public"."supplier_invoice_imports" ("org_id", "id");

create unique index concurrently "banks_org_id_id_uq"
  on "public"."banks" ("org_id", "id");

create unique index concurrently "bank_movements_org_id_id_uq"
  on "public"."bank_movements" ("org_id", "id");

create unique index concurrently "bank_statement_imports_org_id_id_uq"
  on "public"."bank_statement_imports" ("org_id", "id");

-- no `id` column -- keyed by `code` (see header)
create unique index concurrently "crm_action_types_org_id_code_uq"
  on "public"."crm_action_types" ("org_id", "code");

create unique index concurrently "crm_contacts_org_id_id_uq"
  on "public"."crm_contacts" ("org_id", "id");

-- no `id` column -- keyed by `name` (see header)
create unique index concurrently "crm_tags_org_id_name_uq"
  on "public"."crm_tags" ("org_id", "name");

create unique index concurrently "hr_work_shifts_org_id_id_uq"
  on "public"."hr_work_shifts" ("org_id", "id");

create unique index concurrently "pizza_recipes_org_id_id_uq"
  on "public"."pizza_recipes" ("org_id", "id");

create unique index concurrently "recurring_contracts_org_id_id_uq"
  on "public"."recurring_contracts" ("org_id", "id");

create unique index concurrently "payable_entries_org_id_id_uq"
  on "public"."payable_entries" ("org_id", "id");

create unique index concurrently "stock_categories_org_id_id_uq"
  on "public"."stock_categories" ("org_id", "id");

-- =============================================================================
-- 2. org_id-prepended query-planner indexes -- extends existing single-
--    column indexes confirmed against real ScopedQuery call sites (ticket
--    01). The source index is left in place untouched; this only adds the
--    org_id-prefixed sibling. Column order/direction matches the source
--    index exactly (checked via pg_indexes).
-- =============================================================================

-- bank_movements
create index concurrently "idx_bank_movements_org_id_statement_import_id"
  on "public"."bank_movements" ("org_id", "statement_import_id");

create index concurrently "idx_bank_movements_org_id_reconciliation_status"
  on "public"."bank_movements" ("org_id", "reconciliation_status");

create index concurrently "idx_bank_movements_org_id_risk_level"
  on "public"."bank_movements" ("org_id", "risk_level");

create index concurrently "idx_bank_movements_org_id_booking_date"
  on "public"."bank_movements" ("org_id", "booking_date");

-- bank_statement_imports
create index concurrently "idx_bank_statement_imports_org_id_account_number"
  on "public"."bank_statement_imports" ("org_id", "account_number");

create index concurrently "idx_bank_statement_imports_org_id_period"
  on "public"."bank_statement_imports" ("org_id", "period_start", "period_end");

create index concurrently "idx_bank_statement_imports_org_id_bank_account_id"
  on "public"."bank_statement_imports" ("org_id", "bank_account_id");

-- cash_closings
create index concurrently "idx_cash_closings_org_id_status"
  on "public"."cash_closings" ("org_id", "status");

create index concurrently "idx_cash_closings_org_id_employee_id"
  on "public"."cash_closings" ("org_id", "employee_id");

create index concurrently "idx_cash_closings_org_id_closing_date"
  on "public"."cash_closings" ("org_id", "closing_date");

-- crm_customer_actions / crm_customer_tags
create index concurrently "idx_crm_customer_actions_org_id_customer_id"
  on "public"."crm_customer_actions" ("org_id", "customer_id");

create index concurrently "idx_crm_customer_tags_org_id_customer_id"
  on "public"."crm_customer_tags" ("org_id", "customer_id");

-- classification_rules
create index concurrently "idx_classification_rules_org_id_supplier_id"
  on "public"."classification_rules" ("org_id", "supplier_id");

-- hr_employees
create index concurrently "idx_hr_employees_org_id_status"
  on "public"."hr_employees" ("org_id", "status");

-- invoices
create index concurrently "idx_invoices_org_id_supplier_id"
  on "public"."invoices" ("org_id", "supplier_id");

create index concurrently "idx_invoices_org_id_status"
  on "public"."invoices" ("org_id", "status");

create index concurrently "idx_invoices_org_id_reconciliation_status"
  on "public"."invoices" ("org_id", "reconciliation_status");

create index concurrently "idx_invoices_org_id_invoice_date"
  on "public"."invoices" ("org_id", "invoice_date" desc);

-- invoice_lines
create index concurrently "idx_invoice_lines_org_id_invoice_id"
  on "public"."invoice_lines" ("org_id", "invoice_id");

create index concurrently "idx_invoice_lines_org_id_cost_center_id"
  on "public"."invoice_lines" ("org_id", "cost_center_id");

-- bank_movement_entity_links
create index concurrently "idx_bank_movement_entity_links_org_id_movement_id"
  on "public"."bank_movement_entity_links" ("org_id", "movement_id");

-- recurring_contracts
create index concurrently "idx_recurring_contracts_org_id_status"
  on "public"."recurring_contracts" ("org_id", "status");

create index concurrently "idx_recurring_contracts_org_id_type"
  on "public"."recurring_contracts" ("org_id", "type");

create index concurrently "idx_recurring_contracts_org_id_supplier_id"
  on "public"."recurring_contracts" ("org_id", "supplier_id");

-- recurring_occurrences
create index concurrently "idx_recurring_occurrences_org_id_recurrence_id"
  on "public"."recurring_occurrences" ("org_id", "recurrence_id");

create index concurrently "idx_recurring_occurrences_org_id_period"
  on "public"."recurring_occurrences" ("org_id", "period");

create index concurrently "idx_recurring_occurrences_org_id_status"
  on "public"."recurring_occurrences" ("org_id", "status");

create index concurrently "idx_recurring_occurrences_org_id_due_date"
  on "public"."recurring_occurrences" ("org_id", "due_date");

-- supplier_import_hints / bank_movement_match_hints
create index concurrently "idx_supplier_import_hints_org_id_normalized_name"
  on "public"."supplier_import_hints" ("org_id", "normalized_name");

create index concurrently "idx_bank_movement_match_hints_org_id_normalized_description"
  on "public"."bank_movement_match_hints" ("org_id", "normalized_description");
