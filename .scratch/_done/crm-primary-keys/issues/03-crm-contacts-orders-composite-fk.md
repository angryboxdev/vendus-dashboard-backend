# 03 — Composite FKs on `crm_contacts` and `crm_orders` to `crm_customers`

**What to build:** both tables' `customer_id text → crm_customers.id`
single-column FK becomes the composite `(org_id, customer_id) →
crm_customers(org_id, id)`. After this ticket, org A can no longer create a
contact or an order that references org B's customer id — the database
rejects it instead of silently linking across organizations. No application
code changes.

Same mechanical shape on both tables, hence one ticket.

**Blocked by:** 02 (`crm_customers` composite PK must exist first). **Hard
external dependency (per spec D7):** `.scratch/composite-fk-indexes/spec.md`'s
FK-widening technique must exist **and be merged** before this is picked up
— re-check before starting.

**Status:** done, verified

- [x] `crm_contacts`'s FK to `crm_customers` is composite:
      `(org_id, customer_id) → crm_customers(org_id, id)`
- [x] `crm_orders`'s FK to `crm_customers` is composite:
      `(org_id, customer_id) → crm_customers(org_id, id)`
- [x] Existing single-organization data migrates cleanly, no backfill needed
- [x] Smoke test: org A cannot insert a `crm_contacts` row referencing org
      B's customer id — rejected
- [x] Smoke test: org A cannot insert a `crm_orders` row referencing org B's
      customer id — rejected
- [x] `crm_contacts.script_code` / any other unenforced column is untouched
      — this ticket does not add new FK enforcement beyond `customer_id`
      (see spec D5)

## Implementation notes

- **No new migration needed.** Both composite FKs this ticket asks for
  already exist on the current schema, as a documented mechanical side
  effect of ticket 02's migration
  (`supabase/migrations/20260909100000_crm_customers_composite_pk.sql`):
  dropping `crm_customers`' old single-column `pkey` required first
  dropping every FK still pointing at it, including the four old
  single-column FKs on `crm_contacts`/`crm_orders`/`crm_customer_tags`/
  `crm_customer_actions` — and ticket 02 recreated all four dependents'
  composite FKs (originally added by the composite-fk-indexes spec's
  phase2b) with `ON DELETE CASCADE` added, `NOT VALID` + `VALIDATE
  CONSTRAINT`. This ticket's own two (`crm_contacts`, `crm_orders`) were
  part of that batch. This ticket's job was to verify that state directly
  and close the ticket, not to write new SQL.
- **Hard external dependency check (per spec D7):** confirmed merged.
  `.scratch/_done/composite-fk-indexes/spec.md` — commit `30d1f25` ("chore(04):
  add composite fks for Stock and CRM") is an ancestor of both `main` and
  this branch (`git merge-base --is-ancestor 30d1f25 main` /
  `HEAD` both succeed).
- Verified directly against the local Supabase DB
  (`supabase_db_vendus-dashboard-backend` container, `psql`), not by
  reading migration files alone:
  - `pg_constraint` on `crm_contacts`: only `crm_contacts_org_id_customer_id_fkey`
    — `FOREIGN KEY (org_id, customer_id) REFERENCES crm_customers(org_id, id)
    ON DELETE CASCADE`, `convalidated = t`. The old single-column
    `crm_contacts_customer_id_fkey` is gone.
  - `pg_constraint` on `crm_orders`: only `crm_orders_org_id_customer_id_fkey`
    — same shape, `convalidated = t`. The old single-column
    `crm_orders_customer_id_fkey` is gone.
  - `crm_contacts.script_code` carries no FK (just its existing btree
    index) — untouched, per spec D5.
- Smoke test methodology: direct SQL via `docker exec -i ... psql`
  (mirroring tickets 01/02), two throwaway orgs
  (`11111111-.../SMOKE-NIF-A03`, `22222222-.../SMOKE-NIF-B03`). Recorded
  baseline first (`organizations`: 1, `crm_customers`: 8, `crm_contacts`: 5,
  `crm_orders`: 0).
  - Own-org insert: org A's `crm_contacts`/`crm_orders` row referencing
    org A's own `C001` customer — both succeeded.
  - Cross-org insert: created a customer `id = 'C999'` that exists only
    under org A, then attempted a `crm_contacts` row and a `crm_orders`
    row under org B referencing `customer_id = 'C999'`. Both rejected:
    `ERROR: insert or update on table "crm_contacts" violates foreign key
    constraint "crm_contacts_org_id_customer_id_fkey" DETAIL: Key
    (org_id, customer_id)=(22222222-..., C999) is not present in table
    "crm_customers".` and the equivalent for `crm_orders_org_id_customer_id_fkey`.
    (First attempt used `customer_id = 'C001'`, which both throwaway orgs
    legitimately have — same false-negative trap ticket 02 flagged — caught
    and retried with an org-A-only id.)
  - Cleanup: deleted all smoke rows/orgs. Post-cleanup counts matched the
    baseline exactly (`organizations`: 1, `crm_customers`: 8,
    `crm_contacts`: 5, `crm_orders`: 0).
- Verification: `npm run typecheck` passed clean (no app code touched —
  this ticket is DB-schema-only). Ran the two Jest suites that reference
  CRM (`src/modules/crm/__tests__/application/crm-workspace.service.test.ts`,
  `src/domain/__tests__/crmMetrics.test.ts`) — both use fakes, no real DB
  client — 19/19 passed, unaffected by the schema.
- Per `implement-repo`: no code review, no commit — working tree is
  unchanged (this ticket added no new files; only this issue file was
  edited).
