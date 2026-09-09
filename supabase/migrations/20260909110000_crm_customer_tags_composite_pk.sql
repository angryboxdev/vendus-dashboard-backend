-- Composite PK for `crm_customer_tags`
-- (`.scratch/crm-primary-keys/issues/04-crm-customer-tags-composite-pk-and-fks.md`).
--
-- Widens `crm_customer_tags`' own primary key from `(customer_id, tag_name)`
-- to `(org_id, customer_id, tag_name)` (spec D3). Without this, two
-- organizations independently tagging their respective `'C001'` customer as
-- `'VIP'` would collide on this join table's own PK even though both
-- composite FKs into `crm_customers` and `crm_tags` are already correct.
--
-- Both composite FKs this ticket asked for already exist, validated, with
-- `ON DELETE CASCADE`:
--   - `crm_customer_tags_org_id_customer_id_fkey` -- added by ticket 02's
--     migration (`20260909100000_crm_customers_composite_pk.sql`), as a
--     mechanical side effect of widening `crm_customers`' own pkey.
--   - `crm_customer_tags_org_id_tag_name_fkey` -- added by ticket 01's
--     migration (`20260909090000_crm_standalone_parent_composite_pks.sql`),
--     same reason for `crm_tags`.
-- Nothing else in the schema references `crm_customer_tags`'s own primary
-- key as a foreign key, so dropping and recreating it needs no dependent-FK
-- cleanup first -- unlike tickets 01/02's parent-table pkey swaps.
--
-- No pre-built unique index exists for `(org_id, customer_id, tag_name)`
-- (phase 1 of the composite-fk-indexes spec only built the plain,
-- non-unique `idx_crm_customer_tags_org_id_customer_id` to support the FK
-- above). `crm_customer_tags` is a small, human-curated join table in the
-- same low-cardinality class as `crm_parameters`/`crm_scripts` (spec D6), so
-- the swap is a plain synchronous drop/add, no `CONCURRENTLY` needed.

alter table "public"."crm_customer_tags"
  drop constraint "crm_customer_tags_pkey";

alter table "public"."crm_customer_tags"
  add constraint "crm_customer_tags_pkey" primary key (org_id, customer_id, tag_name);
