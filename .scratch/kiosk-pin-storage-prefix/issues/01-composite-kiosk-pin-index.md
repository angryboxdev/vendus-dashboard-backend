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

**Status:** ready-for-agent

- [ ] `CREATE UNIQUE INDEX CONCURRENTLY hr_employees_kiosk_pin_hash_org_uq ON
      hr_employees (org_id, kiosk_pin_hash) WHERE kiosk_pin_hash IS NOT
      NULL`, then `DROP INDEX hr_employees_kiosk_pin_hash_uq`, in a migration
      that runs outside the Supabase CLI's implicit transaction (`CREATE
      INDEX CONCURRENTLY` can't run inside one).
- [ ] A migration-level check confirms the new composite index exists and
      the old global index is gone.
- [ ] A regression test asserts `findActiveByPinHash`
      (`cash-closings` module) and `findActiveEmployeeByPinHash`
      (`hrEmployeeService.ts`) both filter by organization before the
      `kiosk_pin_hash` predicate runs.
- [ ] Existing tests for both lookups still pass unchanged.
