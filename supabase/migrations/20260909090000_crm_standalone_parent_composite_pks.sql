-- Composite PKs for the four standalone CRM parent tables
-- (`.scratch/crm-primary-keys/issues/01-standalone-parent-composite-pks.md`).
--
-- Widens the primary key on `crm_parameters`, `crm_scripts`, `crm_tags` and
-- `crm_action_types` to include `org_id`, so two organizations can each
-- define a parameter/script/tag/action-type reusing the same human-assigned
-- key/code/name without a unique-constraint collision. Deferred register
-- item 4 (see `.scratch/_done/composite-fk-indexes/spec.md` D7): that spec's
-- composite FKs are the prerequisite this ticket needed before the parent's
-- key shape could change safely, and it's already merged.
--
-- `crm_parameters` and `crm_scripts` have zero FK dependents anywhere in the
-- schema -- their PK swap is a plain, synchronous drop-old/add-new, no
-- CONCURRENTLY needed (small tables today, and nothing else references
-- them).
--
-- `crm_tags` and `crm_action_types` do have dependents. Both still carry
-- their original single-column FKs (`crm_customer_actions_action_type_code_fkey`,
-- `crm_customer_tags_tag_name_fkey`) alongside the new composite FKs the
-- composite-fk-indexes spec already added and validated
-- (`crm_customer_actions_org_id_action_type_code_fkey`,
-- `crm_customer_tags_org_id_tag_name_fkey`). Postgres refuses to drop
-- `crm_action_types_pkey` / `crm_tags_pkey` while the old single-column FKs
-- still point at them, so those two redundant FKs are dropped first -- their
-- job is now fully done by the composite FKs.
--
-- The composite PKs reuse the `UNIQUE (org_id, code)` / `UNIQUE (org_id,
-- name)` indexes phase 1 of that spec already built
-- (`crm_action_types_org_id_code_uq`, `crm_tags_org_id_name_uq`), via
-- `PRIMARY KEY USING INDEX` (same technique phase2a used for `UNIQUE USING
-- INDEX`) -- Postgres renames the index to match the new constraint name.
--
-- `crm_customer_tags_tag_name_fkey` had `ON DELETE CASCADE`; the composite
-- FK that replaces it (`crm_customer_tags_org_id_tag_name_fkey`) did not, so
-- it's dropped and recreated here with `ON DELETE CASCADE` added to keep
-- cascade-delete behavior on `crm_tags` unchanged. `crm_action_types` never
-- had a cascade, so its composite FK is left exactly as-is.

-- =============================================================================
-- 1. Drop old redundant single-column FKs -- required before the old
--    single-column pkeys they reference can be dropped.
-- =============================================================================

alter table "public"."crm_customer_actions"
  drop constraint "crm_customer_actions_action_type_code_fkey";

alter table "public"."crm_customer_tags"
  drop constraint "crm_customer_tags_tag_name_fkey";

-- =============================================================================
-- 2. Drop old single-column primary keys.
-- =============================================================================

alter table "public"."crm_parameters"
  drop constraint "crm_parameters_pkey";

alter table "public"."crm_scripts"
  drop constraint "crm_scripts_pkey";

alter table "public"."crm_tags"
  drop constraint "crm_tags_pkey";

alter table "public"."crm_action_types"
  drop constraint "crm_action_types_pkey";

-- =============================================================================
-- 3. Add new composite primary keys.
-- =============================================================================

alter table "public"."crm_parameters"
  add constraint "crm_parameters_pkey" primary key (org_id, key);

alter table "public"."crm_scripts"
  add constraint "crm_scripts_pkey" primary key (org_id, code);

alter table "public"."crm_tags"
  add constraint "crm_tags_pkey" primary key using index "crm_tags_org_id_name_uq";

alter table "public"."crm_action_types"
  add constraint "crm_action_types_pkey" primary key using index "crm_action_types_org_id_code_uq";

-- =============================================================================
-- 4. Recreate crm_customer_tags' composite FK with ON DELETE CASCADE, to
--    preserve the original single-column FK's delete semantics.
-- =============================================================================

alter table "public"."crm_customer_tags"
  drop constraint "crm_customer_tags_org_id_tag_name_fkey";

alter table "public"."crm_customer_tags"
  add constraint "crm_customer_tags_org_id_tag_name_fkey"
  foreign key (org_id, tag_name) references public.crm_tags (org_id, name)
  on delete cascade;
