# 04 — `crm_customer_tags`: composite FKs and its own composite PK

**What to build:** `crm_customer_tags` gets composite FKs on both columns —
`(org_id, customer_id) → crm_customers(org_id, id)` and
`(org_id, tag_name) → crm_tags(org_id, name)` — **and** its own primary key
widens from `(customer_id, tag_name)` to `(org_id, customer_id, tag_name)`.
Skipping the PK widening is the easy mistake here (spec D3): without it, two
organizations independently tagging their respective `'C001'` customer as
`'VIP'` collide on the join table's own PK even after the FKs are fixed.

After this ticket: two organizations can each tag their `'C001'` as `'VIP'`
(succeeds); the same `(org_id, customer_id, tag_name)` triple twice under
one organization still fails as a duplicate (unchanged behavior); org A
cannot reference org B's customer or tag in this table (rejected).

**Blocked by:** 01 (`crm_tags` composite PK) and 02 (`crm_customers`
composite PK). **Hard external dependency (per spec D7):**
`.scratch/composite-fk-indexes/spec.md`'s FK-widening technique must exist
**and be merged** before this is picked up — re-check before starting.

**Status:** done, verified

- [x] `crm_customer_tags` primary key is `(org_id, customer_id, tag_name)`
- [x] FK to `crm_customers` is composite:
      `(org_id, customer_id) → crm_customers(org_id, id)`
- [x] FK to `crm_tags` is composite:
      `(org_id, tag_name) → crm_tags(org_id, name)`
- [x] Existing single-organization data migrates cleanly, no backfill needed
- [x] Smoke test: two organizations each tag their own `'C001'` customer as
      `'VIP'` — both succeed
- [x] Smoke test: the same `(org_id, customer_id, tag_name)` triple inserted
      twice under the same organization still fails as a duplicate
- [x] Smoke test: org A cannot insert a `crm_customer_tags` row referencing
      org B's customer id or tag name — rejected

## Implementation notes

- Migration: `supabase/migrations/20260909110000_crm_customer_tags_composite_pk.sql`.
- Both composite FKs this ticket asked for **already existed, validated,
  with `ON DELETE CASCADE`**, as mechanical side effects of tickets 01 and
  02: `crm_customer_tags_org_id_tag_name_fkey` (from ticket 01's
  `20260909090000_crm_standalone_parent_composite_pks.sql`) and
  `crm_customer_tags_org_id_customer_id_fkey` (from ticket 02's
  `20260909100000_crm_customers_composite_pk.sql`). This ticket's only
  remaining work was widening `crm_customer_tags`' own primary key (D3).
- Nothing in the schema references `crm_customer_tags`'s own primary key as
  a foreign key, so — unlike tickets 01/02's parent-table pkey swaps — no
  dependent-FK drop was needed first. Plain synchronous
  `DROP CONSTRAINT` / `ADD CONSTRAINT ... PRIMARY KEY (org_id, customer_id,
  tag_name)`, no pre-built unique index and no `CONCURRENTLY`: this is a
  small, human-curated join table in the same low-cardinality class as
  `crm_parameters`/`crm_scripts` (spec D6).
- No deviations from the plan.
- Verification: `npm run typecheck` passed with no errors (no app code
  touched). Grepped `src` for Jest tests importing `crmCustomerService`,
  `crm/customers`, or `crmRoutes` — none found, so no test suite run was
  applicable, matching tickets 01/02's precedent.
- Local stack: `npx supabase db reset` applied all migrations including
  this one cleanly, no errors.
- Smoke test methodology: direct SQL via `docker exec ... psql` against the
  local Supabase DB, no HTTP/app layer, mirroring tickets 01/02. Baseline
  row counts recorded first (`organizations`: 1, `crm_customer_tags`: 7,
  `crm_customers`: 8, `crm_tags`: 6). Used two throwaway orgs
  (`11111111-.../SMOKE-NIF-A`, `22222222-.../SMOKE-NIF-B`).
  - Each org inserted a `crm_customers` row `id = 'C001'`, a `crm_tags` row
    `name = 'VIP'`, then a `crm_customer_tags` row `(customer_id='C001',
    tag_name='VIP')` — all inserts succeeded for both orgs.
  - A same-org duplicate insert of `(org_id, 'C001', 'VIP')` failed with
    `duplicate key value violates unique constraint
    "crm_customer_tags_pkey"`, `DETAIL: Key (org_id, customer_id,
    tag_name)=(...) already exists.`
  - Cross-org customer reference: org A inserted a `crm_customer_tags` row
    naming org B's `'C999'` (a customer that exists only under org B) —
    rejected with `violates foreign key constraint
    "crm_customer_tags_org_id_customer_id_fkey"`.
  - Cross-org tag reference: org A inserted a `crm_customer_tags` row
    naming org B's `'B-ONLY-TAG'` (a tag that exists only under org B) —
    rejected with `violates foreign key constraint
    "crm_customer_tags_org_id_tag_name_fkey"`.
  - Cleanup: deleted all test `crm_customer_tags`/`crm_tags`/`crm_customers`
    rows and both throwaway orgs. Post-cleanup counts matched the recorded
    baseline exactly.
