# 05 — Composite FKs on `crm_customer_actions`

**What to build:** `crm_customer_actions` gets composite FKs on both
columns — `(org_id, customer_id) → crm_customers(org_id, id)` and
`(org_id, action_type_code) → crm_action_types(org_id, code)`. Its own
primary key is already a server-generated `uuid`, so no PK widening is
needed here (unlike ticket 04's join table). This table is queried through
the new-pattern module (`src/modules/crm/adapters/out/supabase-crm-workspace.repository.ts`),
not just the legacy service layer — worth a smoke test through that path
too.

After this ticket: org A cannot record a customer action referencing org
B's customer or action type — rejected instead of silently linking across
organizations.

**Blocked by:** 01 (`crm_action_types` composite PK) and 02
(`crm_customers` composite PK). **Hard external dependency (per spec D7):**
`.scratch/composite-fk-indexes/spec.md`'s FK-widening technique must exist
**and be merged** before this is picked up — re-check before starting.

**Status:** done, verified

- [x] FK to `crm_customers` is composite:
      `(org_id, customer_id) → crm_customers(org_id, id)`
- [x] FK to `crm_action_types` is composite:
      `(org_id, action_type_code) → crm_action_types(org_id, code)`
- [x] Existing single-organization data migrates cleanly, no backfill needed
- [x] Smoke test: org A cannot insert a `crm_customer_actions` row
      referencing org B's customer id or action-type code — rejected
- [x] `crm_customer_actions.script_code` stays unenforced — this ticket
      does not add new FK enforcement beyond `customer_id` /
      `action_type_code` (see spec D5)
- [x] `crm_customer_actions.source_key`'s pre-existing global unique
      constraint is untouched — out of scope (see spec's "Noted, not
      decided")

## Implementation notes

- No new migration needed. Both composite FKs this ticket asked for
  **already existed, validated**, as mechanical side effects of earlier
  work: `crm_customer_actions_org_id_action_type_code_fkey` (added by
  `.scratch/_done/composite-fk-indexes`'s phase2b migration,
  `20260908100001_composite_fk_indexes_phase2b.sql`, referencing the
  `UNIQUE (org_id, code)` index on `crm_action_types` that phase 1 built)
  and `crm_customer_actions_org_id_customer_id_fkey` (also from phase2b,
  then dropped and recreated with `ON DELETE CASCADE` added by ticket 02's
  migration, `20260909100000_crm_customers_composite_pk.sql`, to preserve
  the old single-column FK's cascade semantics). Ticket 01
  (`20260909090000_crm_standalone_parent_composite_pks.sql`) swapped
  `crm_action_types`' own primary key onto that same reused index via
  `PRIMARY KEY USING INDEX` and explicitly left this FK "exactly as-is" —
  confirmed still valid against it post-swap.
  `crm_customer_actions` itself has no PK to widen (server-generated
  `uuid`), so this ticket's only remaining work was verification.
- Hard external dependency check: `.scratch/_done/composite-fk-indexes/`
  (moved out of the in-progress `.scratch/composite-fk-indexes/` path,
  `Status: done (all tickets 01-07 closed)`) — merged, per
  `git log` (`30d1f25 chore(04): add composite fks for Stock and CRM`,
  landed on `main` before this branch).
- Blocked-by check: tickets 01 and 02 both `Status: done, verified` already.
- Verified directly against the local Supabase DB
  (`docker exec supabase_db_vendus-dashboard-backend psql`, current
  migration state, `npx supabase migration list --local` shows local/remote
  in sync through `20260909110000`):
  `pg_get_constraintdef` on both FKs matches the ticket's target shape
  exactly, `convalidated = t` for both. Confirmed `script_code` has no FK
  (`information_schema`/`pg_constraint` show none) and
  `crm_customer_actions_source_key_key` is still a plain global
  `UNIQUE (source_key)`, untouched.
- Smoke test — through the new-pattern module, per the ticket's ask, not
  just raw SQL: a throwaway `tsx` script instantiated
  `SupabaseCrmWorkspaceRepository` with the real `createScopedQuery`
  factory (env vars pointed at the local Supabase stack,
  `http://127.0.0.1:54321`, only for that process — `.env` itself untouched
  and still points at the shared remote dev project) and called
  `createActions(...)` directly, mirroring what `CrmWorkspaceService` does.
  Two throwaway orgs (`11111111-.../SMOKE-NIF-A`,
  `22222222-.../SMOKE-NIF-B`) each got one `crm_customers` row
  (`SMOKE-C-A`/`SMOKE-C-B`) and one `crm_action_types` row
  (`SMOKE-AT-A`/`SMOKE-AT-B`).
  - Positive control: org A creating an action against its own customer id
    and action-type code — succeeded, row returned.
  - Org A → org B's `customer_id`: rejected,
    `violates foreign key constraint "crm_customer_actions_org_id_customer_id_fkey"`.
  - Org A → org B's `action_type_code`: rejected,
    `violates foreign key constraint "crm_customer_actions_org_id_action_type_code_fkey"`.
  - Cleanup: deleted all smoke rows and both throwaway orgs; baseline
    counts (`organizations`: 1, `crm_customers`: 8, `crm_action_types`: 5,
    `crm_customer_actions`: 5) matched exactly afterward. Scratch script
    deleted, not committed.
- Verification: `npm run typecheck` passed with no errors (no app code
  changed — this ticket needed none). `npm test -- --runInBand
  --testPathPattern=src/modules/crm` passed (2 suites, 22 tests).
- No deviations from the plan. No commit made (per this run's
  instructions) — the pre-existing migrations this ticket verifies are
  already committed on this branch from tickets 01/02; nothing new to
  commit for 05 itself.
