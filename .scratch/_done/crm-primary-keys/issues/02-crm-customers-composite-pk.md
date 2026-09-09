# 02 — Composite PK for `crm_customers`, including the self-referencing FK

**What to build:** `crm_customers` primary key widens from `id text` to
`(org_id, id)`. Its self-referencing `referred_by text references
crm_customers(id)` becomes the composite `(org_id, referred_by) →
crm_customers(org_id, id)`. After this ticket, two organizations can each
create a customer with `id = 'C001'` (exactly what `nextCustomerId()`
already generates per-organization,
`src/services/crmCustomerService.ts:83-93`) without a unique-constraint
collision, and org A can't set `referred_by` to org B's customer id.

`crm_customers.id` stays a plain text value with the same shape and meaning
— it's a live public API path parameter (`GET/PATCH /crm/customers/:id`).
No frontend or route contract change (spec's D1). No other application code
changes — every call site already scopes by `org_id`.

This ticket does not touch `crm_contacts`, `crm_orders`,
`crm_customer_tags`, or `crm_customer_actions` — their FKs into
`crm_customers` are tickets 03-05.

**Blocked by:** None from this feature's own ticket set. **Hard external
dependency (per spec D7):** `.scratch/composite-fk-indexes/spec.md`'s
FK-widening technique must exist **and be merged** before this is picked up
— re-check before starting.

**Status:** done, verified

- [x] `crm_customers` primary key is `(org_id, id)`
- [x] `referred_by`'s self-referencing FK is composite:
      `(org_id, referred_by) → crm_customers(org_id, id)`
- [x] Existing single-organization data migrates cleanly, no backfill needed
- [x] Smoke test: two organizations each insert a customer with `id =
      'C001'` — both succeed
- [x] Smoke test: org A cannot set `referred_by` to org B's customer id —
      rejected by the composite FK
- [x] `GET`/`PATCH /crm/customers/:id` and the other routes at
      `src/routes/crmRoutes.ts` are unaffected — `id` is still the plain
      text value in requests/responses

## Implementation notes

- Migration: `supabase/migrations/20260909100000_crm_customers_composite_pk.sql`.
- Reused: the `UNIQUE (org_id, id)` index the composite-fk-indexes spec
  already built (`crm_customers_org_id_id_uq`), swapped in as the new pkey
  via `PRIMARY KEY USING INDEX` (Postgres renamed it to
  `crm_customers_pkey`). Also reused the already-validated composite
  self-ref FK `crm_customers_org_id_referred_by_fkey` — it needed no
  changes and is what now enforces the org-scoped `referred_by` check.
- Newly added: nothing schema-wise beyond the pkey swap itself — the four
  dependents' composite FKs (`crm_contacts_org_id_customer_id_fkey`,
  `crm_customer_actions_org_id_customer_id_fkey`,
  `crm_customer_tags_org_id_customer_id_fkey`,
  `crm_orders_org_id_customer_id_fkey`) already existed from phase2b; this
  migration only dropped and recreated them to add `ON DELETE CASCADE`.
- Deviation from the ticket's literal text: the ticket says "This ticket
  does not touch crm_contacts, crm_orders, crm_customer_tags, or
  crm_customer_actions." That line means no *new* composite-FK enforcement
  was added to those tables (already true — phase2b did it). Mechanically,
  though, dropping `crm_customers_pkey` requires first dropping every old
  single-column FK still pointing at it, and four of those five old FKs
  live on those exact four dependent tables
  (`crm_contacts_customer_id_fkey`, `crm_customer_actions_customer_id_fkey`,
  `crm_customer_tags_customer_id_fkey`, `crm_orders_customer_id_fkey`, plus
  `crm_customers_referred_by_fkey` on `crm_customers` itself). Postgres
  refuses to drop a pkey while any FK still depends on it, so dropping
  those five was a required mechanical prerequisite, confirmed correct
  per this ticket's pre-established context.
- Cascade-preservation fix: the four old single-column FKs on
  crm_contacts/crm_customer_actions/crm_customer_tags/crm_orders all had
  `ON DELETE CASCADE`; their composite replacements from phase2b did not.
  To keep delete semantics unchanged, each of those four composite FKs was
  dropped and recreated with `ON DELETE CASCADE` added, using `NOT VALID`
  + a separate `VALIDATE CONSTRAINT` per the composite-fk-indexes spec's
  safety convention (crm_contacts/crm_orders can hold real rows, unlike
  ticket 01's tiny crm_tags/crm_action_types). `crm_customers_referred_by_fkey`
  had no cascade to begin with, so its composite replacement was simply
  left dropped-and-not-recreated — already fully covered by the existing
  validated `crm_customers_org_id_referred_by_fkey`.
- Verification: `npm run typecheck` passed with no errors (no TS fallout —
  no generated DB types file in this repo, no app code changes). No
  existing Jest test imports `crmCustomerService`, `crm/customers`, or
  `crmRoutes` (checked via grep across `src`), so no test suite run was
  applicable/affected.
- Local stack: `npx supabase db reset` applied all migrations including
  this one cleanly, no errors.
- Smoke test methodology: direct SQL via `docker exec ... psql` against
  the local Supabase DB (`supabase_db_vendus-dashboard-backend` container),
  no HTTP/app layer, mirroring ticket 01 exactly. Recorded baseline row
  counts first (`organizations`: 1, `crm_customers`: 8, `crm_contacts`: 5).
  Used two throwaway orgs (`11111111-1111-1111-1111-111111111111` /
  `22222222-2222-2222-2222-222222222222`, `SMOKE-NIF-A`/`SMOKE-NIF-B` for
  the required `organizations.nif`).
  - Inserted a `crm_customers` row with `id = 'C001'` under each org —
    both succeeded (`org_id, id, first_name` select confirmed both rows
    present with distinct `org_id`).
  - A same-org duplicate insert of `id = 'C001'` failed with
    `duplicate key value violates unique constraint "crm_customers_pkey"`,
    `DETAIL: Key (org_id, id)=(...) already exists.` — confirms the new
    composite pkey.
  - Cross-org `referred_by` check: inserted a customer `id = 'C999'` that
    exists only under org A, then org B attempted to insert a customer
    with `referred_by = 'C999'`. Rejected with
    `violates foreign key constraint "crm_customers_org_id_referred_by_fkey"`,
    `DETAIL: Key (org_id, referred_by)=(<org B>, C999) is not present in
    table "crm_customers".` (Note: an initial attempt using `referred_by =
    'C001'` was a false negative — both orgs have their own `'C001'`, so
    that value legitimately exists in org B too. Retried with an id unique
    to org A to get a real cross-org check.)
  - Cascade regression check: inserted a `crm_contacts` row for org A's
    `C001`, confirmed it existed, deleted the `C001` customer row, then
    confirmed the `crm_contacts` row was gone (`ON DELETE CASCADE` via
    `crm_contacts_org_id_customer_id_fkey` fired correctly).
  - Cleanup: deleted all test `crm_customers`/`crm_contacts` rows and both
    throwaway orgs. Post-cleanup counts matched the recorded baseline
    exactly (`organizations`: 1, `crm_customers`: 8, `crm_contacts`: 5).
- Routes confirmation: read `src/routes/crmRoutes.ts` directly —
  `GET /crm/customers/:id`, `PATCH /crm/customers/:id`, and the tags/orders
  sub-routes all call their service functions as
  `fn(req.auth!.orgId, req.params.id, ...)`, already passing `org_id`
  and treating `id` as an opaque path string. No edits made to this file
  or any other application code.
