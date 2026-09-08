-- Composite FKs, phase 2b (`.scratch/composite-fk-indexes/issues/04-phase2b-fks-stock-crm.md`).
-- Adds `FOREIGN KEY (org_id, <col>) REFERENCES <target> (org_id, <id|code|name>)`
-- for every one of the 15 references into `stock_items`, `stock_categories`,
-- `crm_customers` (including its own `referred_by` self-reference),
-- `crm_tags`, `crm_contacts`, and `crm_action_types`. After this migration a
-- write naming another organization's stock item, stock category, CRM
-- customer, CRM tag, CRM contact, or CRM action type is rejected by the
-- database, not by application code. See ticket 01's audit for the ranked
-- inventory and per-table write-path tiering this ticket implements.
--
-- Built online per the ticket: every constraint is added `NOT VALID` first,
-- then `VALIDATE CONSTRAINT`ed in its own statement, so an existing row that
-- fails the check is caught immediately (a genuine cross-tenant data bug,
-- not expected here -- table sizes checked before this ran, see the ticket's
-- Implementation notes) rather than the table being locked for a full table
-- scan while new rows are also blocked from being written to it.
--
-- The `UNIQUE (org_id, id)` targets already exist from phase 1
-- (`20260908090000_composite_fk_indexes_phase1.sql`), including the two
-- natural-key adjustments this phase's FKs attach to:
-- `crm_action_types_org_id_code_uq` (`org_id`, `code`) and
-- `crm_tags_org_id_name_uq` (`org_id`, `name`). Not recreated here.
--
-- Constraint naming follows the existing composite-FK precedent already in
-- the schema (`20260831152632_drop_defaults_and_location_composite_keys.sql`'s
-- `<table>_org_id_<col>_fkey`), and matches the ticket's own example name.

-- =============================================================================
-- 1. stock_items (6 references)
-- =============================================================================

alter table "public"."stock_movements"
  add constraint "stock_movements_org_id_item_id_fkey"
  foreign key (org_id, item_id) references public.stock_items (org_id, id)
  not valid;

alter table "public"."supplier_article_mappings"
  add constraint "supplier_article_mappings_org_id_stock_item_id_fkey"
  foreign key (org_id, stock_item_id) references public.stock_items (org_id, id)
  not valid;

alter table "public"."supplier_invoice_import_lines"
  add constraint "supplier_invoice_import_lines_org_id_stock_item_id_fkey"
  foreign key (org_id, stock_item_id) references public.stock_items (org_id, id)
  not valid;

alter table "public"."pizza_recipe_items"
  add constraint "pizza_recipe_items_org_id_stock_item_id_fkey"
  foreign key (org_id, stock_item_id) references public.stock_items (org_id, id)
  not valid;

alter table "public"."preparation_items"
  add constraint "preparation_items_org_id_stock_item_id_fkey"
  foreign key (org_id, stock_item_id) references public.stock_items (org_id, id)
  not valid;

alter table "public"."vendus_product_mapping"
  add constraint "vendus_product_mapping_org_id_stock_item_id_fkey"
  foreign key (org_id, stock_item_id) references public.stock_items (org_id, id)
  not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_org_id_item_id_fkey";
alter table "public"."supplier_article_mappings" validate constraint "supplier_article_mappings_org_id_stock_item_id_fkey";
alter table "public"."supplier_invoice_import_lines" validate constraint "supplier_invoice_import_lines_org_id_stock_item_id_fkey";
alter table "public"."pizza_recipe_items" validate constraint "pizza_recipe_items_org_id_stock_item_id_fkey";
alter table "public"."preparation_items" validate constraint "preparation_items_org_id_stock_item_id_fkey";
alter table "public"."vendus_product_mapping" validate constraint "vendus_product_mapping_org_id_stock_item_id_fkey";

-- =============================================================================
-- 2. stock_categories (1 reference)
-- =============================================================================

alter table "public"."stock_items"
  add constraint "stock_items_org_id_category_id_fkey"
  foreign key (org_id, category_id) references public.stock_categories (org_id, id)
  not valid;

alter table "public"."stock_items" validate constraint "stock_items_org_id_category_id_fkey";

-- =============================================================================
-- 3. crm_customers (5 references, including the self-reference)
-- =============================================================================

alter table "public"."crm_customers"
  add constraint "crm_customers_org_id_referred_by_fkey"
  foreign key (org_id, referred_by) references public.crm_customers (org_id, id)
  not valid;

alter table "public"."crm_contacts"
  add constraint "crm_contacts_org_id_customer_id_fkey"
  foreign key (org_id, customer_id) references public.crm_customers (org_id, id)
  not valid;

alter table "public"."crm_customer_actions"
  add constraint "crm_customer_actions_org_id_customer_id_fkey"
  foreign key (org_id, customer_id) references public.crm_customers (org_id, id)
  not valid;

alter table "public"."crm_customer_tags"
  add constraint "crm_customer_tags_org_id_customer_id_fkey"
  foreign key (org_id, customer_id) references public.crm_customers (org_id, id)
  not valid;

alter table "public"."crm_orders"
  add constraint "crm_orders_org_id_customer_id_fkey"
  foreign key (org_id, customer_id) references public.crm_customers (org_id, id)
  not valid;

alter table "public"."crm_customers" validate constraint "crm_customers_org_id_referred_by_fkey";
alter table "public"."crm_contacts" validate constraint "crm_contacts_org_id_customer_id_fkey";
alter table "public"."crm_customer_actions" validate constraint "crm_customer_actions_org_id_customer_id_fkey";
alter table "public"."crm_customer_tags" validate constraint "crm_customer_tags_org_id_customer_id_fkey";
alter table "public"."crm_orders" validate constraint "crm_orders_org_id_customer_id_fkey";

-- =============================================================================
-- 4. crm_tags (1 reference) -- natural key (`name`), not `id` (see header)
-- =============================================================================

alter table "public"."crm_customer_tags"
  add constraint "crm_customer_tags_org_id_tag_name_fkey"
  foreign key (org_id, tag_name) references public.crm_tags (org_id, name)
  not valid;

alter table "public"."crm_customer_tags" validate constraint "crm_customer_tags_org_id_tag_name_fkey";

-- =============================================================================
-- 5. crm_contacts (1 reference)
-- =============================================================================

alter table "public"."crm_customer_actions"
  add constraint "crm_customer_actions_org_id_source_contact_id_fkey"
  foreign key (org_id, source_contact_id) references public.crm_contacts (org_id, id)
  not valid;

alter table "public"."crm_customer_actions" validate constraint "crm_customer_actions_org_id_source_contact_id_fkey";

-- =============================================================================
-- 6. crm_action_types (1 reference) -- natural key (`code`), not `id` (see header)
-- =============================================================================

alter table "public"."crm_customer_actions"
  add constraint "crm_customer_actions_org_id_action_type_code_fkey"
  foreign key (org_id, action_type_code) references public.crm_action_types (org_id, code)
  not valid;

alter table "public"."crm_customer_actions" validate constraint "crm_customer_actions_org_id_action_type_code_fkey";
