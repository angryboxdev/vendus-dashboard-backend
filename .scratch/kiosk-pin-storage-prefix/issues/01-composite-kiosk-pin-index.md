# 01 — Kiosk PIN index becomes composite, lookup-scoping re-confirmed

**What to build:** `hr_employees.kiosk_pin_hash` moves from a global unique
index to a composite `(org_id, kiosk_pin_hash)` unique index, so two
employees in different organizations can hold the same 4-digit PIN. No
lookup code changes — both PIN lookups already filter by organization before
the PIN predicate (confirmed by reading the code, not assumed); this ticket
adds the regression test that proves it and closes the gap that no such test
existed.

See `.scratch/kiosk-pin-storage-prefix/spec.md` Section A (Problem
Statement, Solution, DA1) for the full reasoning and the online-migration
technique (spec B2 already proved it for the location composite indexes).

**Blocked by:** None — can start immediately.

**Status:** done, verified

- [x] `CREATE UNIQUE INDEX CONCURRENTLY hr_employees_kiosk_pin_hash_org_uq ON
      hr_employees (org_id, kiosk_pin_hash) WHERE kiosk_pin_hash IS NOT
      NULL`, then `DROP INDEX hr_employees_kiosk_pin_hash_uq`, in a migration
      that runs outside the Supabase CLI's implicit transaction (`CREATE
      INDEX CONCURRENTLY` can't run inside one).
- [x] A migration-level check confirms the new composite index exists and
      the old global index is gone.
- [x] A regression test asserts `findActiveByPinHash`
      (`cash-closings` module) and `findActiveEmployeeByPinHash`
      (`hrEmployeeService.ts`) both filter by organization before the
      `kiosk_pin_hash` predicate runs.
- [x] Existing tests for both lookups still pass unchanged.

## Implementation notes

- Migration: `supabase/migrations/20260909120000_composite_kiosk_pin_index.sql`.
  `CREATE UNIQUE INDEX CONCURRENTLY hr_employees_kiosk_pin_hash_org_uq ON
  hr_employees (org_id, kiosk_pin_hash) WHERE kiosk_pin_hash IS NOT NULL`,
  then a plain `DROP INDEX hr_employees_kiosk_pin_hash_uq` in the same file.
- Deviation from the ticket's literal "outside the Supabase CLI's implicit
  transaction" text: per the already-established
  `20260908090000_composite_fk_indexes_phase1.sql` precedent (verified
  empirically against the installed CLI that `supabase db reset` does not
  wrap a migration file in one enclosing transaction), no special
  out-of-band run was needed — this migration is a normal file in the
  regular migration flow, and `npx supabase db reset` applied it cleanly.
- Migration-level check: `npx supabase db reset` applied all migrations
  including this one cleanly. Confirmed via `\d hr_employees` and
  `pg_indexes`/`pg_index` (`docker exec supabase_db_vendus-dashboard-backend
  psql`) that `hr_employees_kiosk_pin_hash_org_uq` is the only
  `kiosk_pin`-related index left, is a unique btree on `(org_id,
  kiosk_pin_hash)` with the partial `WHERE kiosk_pin_hash IS NOT NULL`
  predicate, and `indisvalid`/`indisready` are both `true`. The old
  `hr_employees_kiosk_pin_hash_uq` no longer appears anywhere.
- Smoke test (direct SQL, same methodology as `crm-primary-keys` ticket 02):
  in a rolled-back transaction, two throwaway orgs
  (`11111111-…`/`22222222-…`, `SMOKE-NIF-A`/`SMOKE-NIF-B`) each inserted an
  `hr_employees` row with the identical `kiosk_pin_hash = 'same-hash'` —
  both succeeded. A second same-org insert with the same hash failed with
  `duplicate key value violates unique constraint
  "hr_employees_kiosk_pin_hash_org_uq"`. Rolled back; post-check
  `organizations`/`hr_employees` counts matched the pre-test baseline (1 / 6).
- Regression tests (both new, both confirm the org filter's `.eq()` call
  happens before the `kiosk_pin_hash` predicate's, using the fake-PostgREST-
  builder technique from `scoped-query.test.ts`):
  - `src/modules/cash-closings/__tests__/adapters/supabase-employee.repository.test.ts`
    — `SupabaseEmployeeRepository.findActiveByPinHash`, built with a fake
    `ScopedQueryFactory` directly (no mocking needed, matches the module's
    existing DI seam).
  - `src/services/__tests__/hrEmployeeService.test.ts` —
    `findActiveEmployeeByPinHash`, which calls `createScopedQuery` directly
    rather than through an injected factory. Mocked
    `../infra/scoped-db/supabase-client.js` by module-path string
    (`jest.mock`/`jest.requireMock`, never imported directly) — this file
    lives outside `src/infra/scoped-db`, so a real import of that module or
    of `@supabase/supabase-js` would trip the `supabase-so-no-scoped-db`
    dependency-cruiser rule (confirmed by hitting the violation once and
    fixing it before finishing).
- Verification: `npx jest --config jest.config.cjs` — 169 suites / 1394
  tests, all passing (including the two new files). `npm run typecheck`
  passes with no errors of my own; a full `npm run typecheck` run at the
  same time surfaced pre-existing `TS2554` errors in
  `src/infra/scoped-db/object-storage.ts`'s callers, but that file (and
  `.scratch/kiosk-pin-storage-prefix/issues/02-qr-device-token.md`, and a
  new `src/routes/__tests__/hrKioskRoutes.test.ts`) were mid-edit from a
  concurrent, unrelated task in this same working directory when I checked
  — not touched by this ticket and not this ticket's problem to fix.
  `npm run lint:deps` — zero violations (775 modules, 2857 dependencies).
