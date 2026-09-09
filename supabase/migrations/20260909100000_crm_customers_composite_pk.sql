-- Composite PK for `crm_customers`, including the self-referencing FK
-- (`.scratch/crm-primary-keys/issues/02-crm-customers-composite-pk.md`).
--
-- Widens `crm_customers`' primary key from `id` to `(org_id, id)`, so two
-- organizations can each create a customer with the same `id` (exactly what
-- `nextCustomerId()` already generates per-organization,
-- `src/services/crmCustomerService.ts:83-93`) without a unique-constraint
-- collision. `crm_customers.id` itself is untouched -- still a plain text
-- value, still the live public API path parameter for
-- `GET`/`PATCH /crm/customers/:id`.
--
-- `crm_customers` still carries its original single-column FKs alongside the
-- composite FKs the composite-fk-indexes spec already added and validated
-- (`crm_customers_org_id_referred_by_fkey`, and the four dependents'
-- `crm_contacts_org_id_customer_id_fkey`,
-- `crm_customer_actions_org_id_customer_id_fkey`,
-- `crm_customer_tags_org_id_customer_id_fkey`,
-- `crm_orders_org_id_customer_id_fkey`). Postgres refuses to drop
-- `crm_customers_pkey` while any of the five old single-column FKs still
-- point at it, so those are dropped first -- their job is now fully done by
-- the composite FKs. This mechanically touches crm_contacts/crm_orders/
-- crm_customer_tags/crm_customer_actions' constraints, but adds no new
-- composite-FK enforcement to them (already done by phase2b) -- ticket
-- 02's own "does not touch" note is about that, not about never dropping a
-- constraint name that happens to live on them.
--
-- The composite PK reuses the `UNIQUE (org_id, id)` index phase 1 of that
-- spec already built (`crm_customers_org_id_id_uq`), via
-- `PRIMARY KEY USING INDEX` -- Postgres renames the index to match the new
-- constraint name.
--
-- Cascade preservation: `crm_contacts_customer_id_fkey`,
-- `crm_customer_actions_customer_id_fkey`, `crm_customer_tags_customer_id_fkey`
-- and `crm_orders_customer_id_fkey` all had `ON DELETE CASCADE`; their
-- composite replacements did not, so those four are dropped and recreated
-- here with `ON DELETE CASCADE` added, keeping cascade-delete behavior on
-- `crm_customers` unchanged. crm_contacts/crm_orders can hold real rows (a
-- bigger blast radius than ticket 01's tiny crm_tags/crm_action_types), so
-- the four re-adds use `NOT VALID` + a separate `VALIDATE CONSTRAINT`,
-- per the composite-fk-indexes spec's own safety convention for FK
-- additions. `crm_customers_referred_by_fkey` had no cascade, and its
-- composite replacement (`crm_customers_org_id_referred_by_fkey`) already
-- covers the relationship, so it's simply dropped and not recreated.

-- =============================================================================
-- 1. Drop old redundant single-column FKs -- required before the old
--    single-column pkey they reference can be dropped.
-- =============================================================================

alter table "public"."crm_customers"
  drop constraint "crm_customers_referred_by_fkey";

alter table "public"."crm_contacts"
  drop constraint "crm_contacts_customer_id_fkey";

alter table "public"."crm_customer_actions"
  drop constraint "crm_customer_actions_customer_id_fkey";

alter table "public"."crm_customer_tags"
  drop constraint "crm_customer_tags_customer_id_fkey";

alter table "public"."crm_orders"
  drop constraint "crm_orders_customer_id_fkey";

-- =============================================================================
-- 2. Drop old single-column primary key.
-- =============================================================================

alter table "public"."crm_customers"
  drop constraint "crm_customers_pkey";

-- =============================================================================
-- 3. Add new composite primary key, reusing the existing unique index.
-- =============================================================================

alter table "public"."crm_customers"
  add constraint "crm_customers_pkey" primary key using index "crm_customers_org_id_id_uq";

-- =============================================================================
-- 4. Recreate the four dependents' composite FKs with ON DELETE CASCADE, to
--    preserve the original single-column FKs' delete semantics. Built
--    online (NOT VALID, then VALIDATE CONSTRAINT) since crm_contacts and
--    crm_orders can hold real rows.
-- =============================================================================

alter table "public"."crm_contacts"
  drop constraint "crm_contacts_org_id_customer_id_fkey";

alter table "public"."crm_contacts"
  add constraint "crm_contacts_org_id_customer_id_fkey"
  foreign key (org_id, customer_id) references public.crm_customers (org_id, id)
  on delete cascade not valid;

alter table "public"."crm_customer_actions"
  drop constraint "crm_customer_actions_org_id_customer_id_fkey";

alter table "public"."crm_customer_actions"
  add constraint "crm_customer_actions_org_id_customer_id_fkey"
  foreign key (org_id, customer_id) references public.crm_customers (org_id, id)
  on delete cascade not valid;

alter table "public"."crm_customer_tags"
  drop constraint "crm_customer_tags_org_id_customer_id_fkey";

alter table "public"."crm_customer_tags"
  add constraint "crm_customer_tags_org_id_customer_id_fkey"
  foreign key (org_id, customer_id) references public.crm_customers (org_id, id)
  on delete cascade not valid;

alter table "public"."crm_orders"
  drop constraint "crm_orders_org_id_customer_id_fkey";

alter table "public"."crm_orders"
  add constraint "crm_orders_org_id_customer_id_fkey"
  foreign key (org_id, customer_id) references public.crm_customers (org_id, id)
  on delete cascade not valid;

alter table "public"."crm_contacts" validate constraint "crm_contacts_org_id_customer_id_fkey";
alter table "public"."crm_customer_actions" validate constraint "crm_customer_actions_org_id_customer_id_fkey";
alter table "public"."crm_customer_tags" validate constraint "crm_customer_tags_org_id_customer_id_fkey";
alter table "public"."crm_orders" validate constraint "crm_orders_org_id_customer_id_fkey";
