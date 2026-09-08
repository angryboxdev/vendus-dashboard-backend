-- Composite FKs, phase 2d -- invoicing, pizza & misc domain
-- (`.scratch/composite-fk-indexes/issues/06-phase2d-fks-invoicing-pizza-misc.md`).
--
-- Adds `FOREIGN KEY (org_id, <col>) REFERENCES <target> (org_id, id)` for
-- every one of the 15 pre-existing references into `invoices`,
-- `supplier_invoice_imports` (including its own self-reference), `pizzas`,
-- `pizza_recipes`, `channels`, `preparations`, `recurring_contracts` and
-- `payable_entries` -- see ticket 01's audit for the full reachability
-- trace of each reference. Purely additive, matching phase 1's own
-- discipline (ticket 02): the pre-existing single-column FKs are left in
-- place untouched, exactly as phase 1 left the pre-existing single-column
-- indexes untouched.
--
-- Built online per spec D3: `NOT VALID` first (a brief `ACCESS EXCLUSIVE`
-- just to record the constraint), then `VALIDATE CONSTRAINT` in its own
-- statement (`SHARE UPDATE EXCLUSIVE`, does not block reads or writes).
-- Unlike phase 1's `CONCURRENTLY` index builds, neither statement needs
-- special non-transactional handling -- both run fine inside the CLI's
-- ordinary one-transaction-per-file migration flow.

-- =============================================================================
-- 1. Attach phase 1's UNIQUE (org_id, id) indexes as constraints (D2) --
--    `ADD CONSTRAINT ... UNIQUE USING INDEX` does not re-scan the table,
--    it just wraps the existing index from
--    20260908090000_composite_fk_indexes_phase1.sql.
-- =============================================================================

alter table "public"."invoices"
  add constraint "invoices_org_id_id_key" unique using index "invoices_org_id_id_uq";

alter table "public"."supplier_invoice_imports"
  add constraint "supplier_invoice_imports_org_id_id_key" unique using index "supplier_invoice_imports_org_id_id_uq";

alter table "public"."pizzas"
  add constraint "pizzas_org_id_id_key" unique using index "pizzas_org_id_id_uq";

alter table "public"."pizza_recipes"
  add constraint "pizza_recipes_org_id_id_key" unique using index "pizza_recipes_org_id_id_uq";

alter table "public"."channels"
  add constraint "channels_org_id_id_key" unique using index "channels_org_id_id_uq";

alter table "public"."preparations"
  add constraint "preparations_org_id_id_key" unique using index "preparations_org_id_id_uq";

alter table "public"."recurring_contracts"
  add constraint "recurring_contracts_org_id_id_key" unique using index "recurring_contracts_org_id_id_uq";

alter table "public"."payable_entries"
  add constraint "payable_entries_org_id_id_key" unique using index "payable_entries_org_id_id_uq";

-- =============================================================================
-- 2. NOT VALID composite foreign keys (15 references)
-- =============================================================================

-- -> channels (2)
alter table "public"."classification_rules"
  add constraint "classification_rules_org_id_channel_id_fkey"
  foreign key (org_id, channel_id) references public.channels (org_id, id) not valid;

alter table "public"."invoice_lines"
  add constraint "invoice_lines_org_id_channel_id_fkey"
  foreign key (org_id, channel_id) references public.channels (org_id, id) not valid;

-- -> invoices (3)
alter table "public"."invoice_lines"
  add constraint "invoice_lines_org_id_invoice_id_fkey"
  foreign key (org_id, invoice_id) references public.invoices (org_id, id) not valid;

alter table "public"."payable_entries"
  add constraint "payable_entries_org_id_invoice_id_fkey"
  foreign key (org_id, invoice_id) references public.invoices (org_id, id) not valid;

alter table "public"."recurring_occurrences"
  add constraint "recurring_occurrences_org_id_invoice_id_fkey"
  foreign key (org_id, invoice_id) references public.invoices (org_id, id) not valid;

-- -> pizzas (3)
alter table "public"."pizza_prices"
  add constraint "pizza_prices_org_id_pizza_id_fkey"
  foreign key (org_id, pizza_id) references public.pizzas (org_id, id) not valid;

alter table "public"."pizza_recipes"
  add constraint "pizza_recipes_org_id_pizza_id_fkey"
  foreign key (org_id, pizza_id) references public.pizzas (org_id, id) not valid;

alter table "public"."vendus_product_mapping"
  add constraint "vendus_product_mapping_org_id_pizza_id_fkey"
  foreign key (org_id, pizza_id) references public.pizzas (org_id, id) not valid;

-- -> preparations (2)
alter table "public"."pizza_recipe_items"
  add constraint "pizza_recipe_items_org_id_preparation_id_fkey"
  foreign key (org_id, preparation_id) references public.preparations (org_id, id) not valid;

alter table "public"."preparation_items"
  add constraint "preparation_items_org_id_preparation_id_fkey"
  foreign key (org_id, preparation_id) references public.preparations (org_id, id) not valid;

-- -> pizza_recipes (1)
alter table "public"."pizza_recipe_items"
  add constraint "pizza_recipe_items_org_id_recipe_id_fkey"
  foreign key (org_id, recipe_id) references public.pizza_recipes (org_id, id) not valid;

-- -> recurring_contracts (1)
alter table "public"."recurring_occurrences"
  add constraint "recurring_occurrences_org_id_recurrence_id_fkey"
  foreign key (org_id, recurrence_id) references public.recurring_contracts (org_id, id) not valid;

-- -> payable_entries (1)
alter table "public"."recurring_occurrences"
  add constraint "recurring_occurrences_org_id_payable_entry_id_fkey"
  foreign key (org_id, payable_entry_id) references public.payable_entries (org_id, id) not valid;

-- -> supplier_invoice_imports (2, one self-referencing)
alter table "public"."supplier_invoice_import_lines"
  add constraint "supplier_invoice_import_lines_org_id_import_id_fkey"
  foreign key (org_id, import_id) references public.supplier_invoice_imports (org_id, id) not valid;

alter table "public"."supplier_invoice_imports"
  add constraint "supplier_invoice_imports_org_id_duplicate_of_import_id_fkey"
  foreign key (org_id, duplicate_of_import_id) references public.supplier_invoice_imports (org_id, id) not valid;

-- =============================================================================
-- 3. VALIDATE CONSTRAINT -- each in its own statement (SHARE UPDATE
--    EXCLUSIVE, does not block reads or writes). Every referenced row was
--    written before any of these constraints existed, and exactly one
--    organization has ever existed in this data, so no row can hold a
--    dangling cross-organization reference -- same reasoning D8 of the
--    org-location-foundation spec used to guarantee a first-try pass.
-- =============================================================================

alter table "public"."classification_rules" validate constraint "classification_rules_org_id_channel_id_fkey";
alter table "public"."invoice_lines" validate constraint "invoice_lines_org_id_channel_id_fkey";
alter table "public"."invoice_lines" validate constraint "invoice_lines_org_id_invoice_id_fkey";
alter table "public"."payable_entries" validate constraint "payable_entries_org_id_invoice_id_fkey";
alter table "public"."recurring_occurrences" validate constraint "recurring_occurrences_org_id_invoice_id_fkey";
alter table "public"."pizza_prices" validate constraint "pizza_prices_org_id_pizza_id_fkey";
alter table "public"."pizza_recipes" validate constraint "pizza_recipes_org_id_pizza_id_fkey";
alter table "public"."vendus_product_mapping" validate constraint "vendus_product_mapping_org_id_pizza_id_fkey";
alter table "public"."pizza_recipe_items" validate constraint "pizza_recipe_items_org_id_preparation_id_fkey";
alter table "public"."preparation_items" validate constraint "preparation_items_org_id_preparation_id_fkey";
alter table "public"."pizza_recipe_items" validate constraint "pizza_recipe_items_org_id_recipe_id_fkey";
alter table "public"."recurring_occurrences" validate constraint "recurring_occurrences_org_id_recurrence_id_fkey";
alter table "public"."recurring_occurrences" validate constraint "recurring_occurrences_org_id_payable_entry_id_fkey";
alter table "public"."supplier_invoice_import_lines" validate constraint "supplier_invoice_import_lines_org_id_import_id_fkey";
alter table "public"."supplier_invoice_imports" validate constraint "supplier_invoice_imports_org_id_duplicate_of_import_id_fkey";
