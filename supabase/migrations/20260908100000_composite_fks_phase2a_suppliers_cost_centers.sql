-- Composite FKs, phase 2a: suppliers & cost-center domain
-- (`.scratch/composite-fk-indexes/issues/03-phase2a-fks-suppliers-cost-centers.md`).
--
-- Closes 22 of the ~65 pre-existing composite-FK gaps (ticket 01's audit):
-- every reference into `suppliers`, `cost_center_categories`,
-- `cost_center_groups` and `cost_centers` gets
-- `FOREIGN KEY (org_id, <col>) REFERENCES <target> (org_id, id)`, so a write
-- naming another organization's supplier/cost-center-category/group/cost
-- center is rejected by Postgres, not merely unlikely.
--
-- Online technique (spec D3): `NOT VALID` first -- ACCESS EXCLUSIVE only long
-- enough to record the constraint, no scan -- then `VALIDATE CONSTRAINT` in
-- its own statement (SHARE UPDATE EXCLUSIVE, doesn't block reads/writes).
-- Both fit inside an ordinary transactional migration; only phase 1's
-- `CONCURRENTLY` index builds needed special handling.
--
-- Each of the four target tables already has a `UNIQUE (org_id, id)` index,
-- built `CONCURRENTLY` in phase 1 (20260908090000). Attaching it as a
-- constraint via `ADD CONSTRAINT ... UNIQUE USING INDEX` reuses that index
-- instead of rescanning.

-- =============================================================================
-- 1. Attach phase 1's unique indexes as constraints -- required before any
--    composite FK can reference these tables.
-- =============================================================================

alter table "public"."suppliers"
  add constraint "suppliers_org_id_id_key" unique using index "suppliers_org_id_id_uq";

alter table "public"."cost_center_categories"
  add constraint "cost_center_categories_org_id_id_key" unique using index "cost_center_categories_org_id_id_uq";

alter table "public"."cost_center_groups"
  add constraint "cost_center_groups_org_id_id_key" unique using index "cost_center_groups_org_id_id_uq";

alter table "public"."cost_centers"
  add constraint "cost_centers_org_id_id_key" unique using index "cost_centers_org_id_id_uq";

-- =============================================================================
-- 2. NOT VALID composite FKs -- 22 references (ticket 01's audit,
--    reconciled against the baseline schema directly).
-- =============================================================================

-- -> suppliers (7)
alter table "public"."bank_movement_match_hints"
  add constraint "bank_movement_match_hints_org_id_supplier_id_fkey"
  foreign key (org_id, supplier_id) references public.suppliers (org_id, id) not valid;

alter table "public"."bank_movements"
  add constraint "bank_movements_org_id_supplier_id_fkey"
  foreign key (org_id, supplier_id) references public.suppliers (org_id, id) not valid;

alter table "public"."classification_rules"
  add constraint "classification_rules_org_id_supplier_id_fkey"
  foreign key (org_id, supplier_id) references public.suppliers (org_id, id) not valid;

alter table "public"."invoices"
  add constraint "invoices_org_id_supplier_id_fkey"
  foreign key (org_id, supplier_id) references public.suppliers (org_id, id) not valid;

alter table "public"."payable_entries"
  add constraint "payable_entries_org_id_supplier_id_fkey"
  foreign key (org_id, supplier_id) references public.suppliers (org_id, id) not valid;

alter table "public"."recurring_contracts"
  add constraint "recurring_contracts_org_id_supplier_id_fkey"
  foreign key (org_id, supplier_id) references public.suppliers (org_id, id) not valid;

alter table "public"."supplier_import_hints"
  add constraint "supplier_import_hints_org_id_supplier_id_fkey"
  foreign key (org_id, supplier_id) references public.suppliers (org_id, id) not valid;

-- -> cost_center_categories (7)
alter table "public"."bank_movements"
  add constraint "bank_movements_org_id_cost_center_category_id_fkey"
  foreign key (org_id, cost_center_category_id) references public.cost_center_categories (org_id, id) not valid;

alter table "public"."classification_rules"
  add constraint "classification_rules_org_id_default_cc_category_id_fkey"
  foreign key (org_id, default_cost_center_category_id) references public.cost_center_categories (org_id, id) not valid;

alter table "public"."invoice_lines"
  add constraint "invoice_lines_org_id_ai_suggested_category_id_fkey"
  foreign key (org_id, ai_suggested_category_id) references public.cost_center_categories (org_id, id) not valid;

alter table "public"."invoice_lines"
  add constraint "invoice_lines_org_id_cost_center_category_id_fkey"
  foreign key (org_id, cost_center_category_id) references public.cost_center_categories (org_id, id) not valid;

alter table "public"."invoices"
  add constraint "invoices_org_id_cost_center_category_id_fkey"
  foreign key (org_id, cost_center_category_id) references public.cost_center_categories (org_id, id) not valid;

alter table "public"."recurring_contracts"
  add constraint "recurring_contracts_org_id_cost_center_category_id_fkey"
  foreign key (org_id, cost_center_category_id) references public.cost_center_categories (org_id, id) not valid;

alter table "public"."suppliers"
  add constraint "suppliers_org_id_default_cost_center_category_id_fkey"
  foreign key (org_id, default_cost_center_category_id) references public.cost_center_categories (org_id, id) not valid;

-- -> cost_center_groups (6) -- note payable_entries.cost_center_id and
-- recurring_contracts.cost_center_id both target cost_center_groups, not
-- cost_centers (confirmed against the baseline schema, not just the column
-- name -- see ticket 01's audit).
alter table "public"."bank_movements"
  add constraint "bank_movements_org_id_cost_center_group_id_fkey"
  foreign key (org_id, cost_center_group_id) references public.cost_center_groups (org_id, id) not valid;

alter table "public"."cost_center_categories"
  add constraint "cost_center_categories_org_id_group_id_fkey"
  foreign key (org_id, group_id) references public.cost_center_groups (org_id, id) not valid;

alter table "public"."invoices"
  add constraint "invoices_org_id_cost_center_group_id_fkey"
  foreign key (org_id, cost_center_group_id) references public.cost_center_groups (org_id, id) not valid;

alter table "public"."payable_entries"
  add constraint "payable_entries_org_id_cost_center_id_fkey"
  foreign key (org_id, cost_center_id) references public.cost_center_groups (org_id, id) not valid;

alter table "public"."recurring_contracts"
  add constraint "recurring_contracts_org_id_cost_center_id_fkey"
  foreign key (org_id, cost_center_id) references public.cost_center_groups (org_id, id) not valid;

alter table "public"."suppliers"
  add constraint "suppliers_org_id_default_cost_center_group_id_fkey"
  foreign key (org_id, default_cost_center_group_id) references public.cost_center_groups (org_id, id) not valid;

-- -> cost_centers (2)
alter table "public"."classification_rules"
  add constraint "classification_rules_org_id_default_cost_center_id_fkey"
  foreign key (org_id, default_cost_center_id) references public.cost_centers (org_id, id) not valid;

alter table "public"."invoice_lines"
  add constraint "invoice_lines_org_id_cost_center_id_fkey"
  foreign key (org_id, cost_center_id) references public.cost_centers (org_id, id) not valid;

-- =============================================================================
-- 3. VALIDATE CONSTRAINT -- each in its own statement (SHARE UPDATE
--    EXCLUSIVE only, no blocking of concurrent reads/writes).
-- =============================================================================

alter table "public"."bank_movement_match_hints" validate constraint "bank_movement_match_hints_org_id_supplier_id_fkey";
alter table "public"."bank_movements" validate constraint "bank_movements_org_id_supplier_id_fkey";
alter table "public"."classification_rules" validate constraint "classification_rules_org_id_supplier_id_fkey";
alter table "public"."invoices" validate constraint "invoices_org_id_supplier_id_fkey";
alter table "public"."payable_entries" validate constraint "payable_entries_org_id_supplier_id_fkey";
alter table "public"."recurring_contracts" validate constraint "recurring_contracts_org_id_supplier_id_fkey";
alter table "public"."supplier_import_hints" validate constraint "supplier_import_hints_org_id_supplier_id_fkey";

alter table "public"."bank_movements" validate constraint "bank_movements_org_id_cost_center_category_id_fkey";
alter table "public"."classification_rules" validate constraint "classification_rules_org_id_default_cc_category_id_fkey";
alter table "public"."invoice_lines" validate constraint "invoice_lines_org_id_ai_suggested_category_id_fkey";
alter table "public"."invoice_lines" validate constraint "invoice_lines_org_id_cost_center_category_id_fkey";
alter table "public"."invoices" validate constraint "invoices_org_id_cost_center_category_id_fkey";
alter table "public"."recurring_contracts" validate constraint "recurring_contracts_org_id_cost_center_category_id_fkey";
alter table "public"."suppliers" validate constraint "suppliers_org_id_default_cost_center_category_id_fkey";

alter table "public"."bank_movements" validate constraint "bank_movements_org_id_cost_center_group_id_fkey";
alter table "public"."cost_center_categories" validate constraint "cost_center_categories_org_id_group_id_fkey";
alter table "public"."invoices" validate constraint "invoices_org_id_cost_center_group_id_fkey";
alter table "public"."payable_entries" validate constraint "payable_entries_org_id_cost_center_id_fkey";
alter table "public"."recurring_contracts" validate constraint "recurring_contracts_org_id_cost_center_id_fkey";
alter table "public"."suppliers" validate constraint "suppliers_org_id_default_cost_center_group_id_fkey";

alter table "public"."classification_rules" validate constraint "classification_rules_org_id_default_cost_center_id_fkey";
alter table "public"."invoice_lines" validate constraint "invoice_lines_org_id_cost_center_id_fkey";
