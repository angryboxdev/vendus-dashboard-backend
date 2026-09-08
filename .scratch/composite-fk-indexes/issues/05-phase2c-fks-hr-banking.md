# 05 — Phase 2c: composite FKs — HR & banking domain

**What to build:** A write naming another organization's HR employee, work
shift, bank account, bank, bank movement, or bank statement import is
rejected by the database, not by application code. Add `FOREIGN KEY
(org_id, <col>) REFERENCES <target> (org_id, id)` for every reference into
`hr_employees`, `hr_work_shifts`, `bank_accounts`, `banks`,
`bank_movements`, and `bank_statement_imports` (12 references), built
online: `NOT VALID` first, `VALIDATE CONSTRAINT` after. `bank_movements`
has carried real production data since day one — check its size before
validating.

**Blocked by:** 01 (ranking/exceptions), 02 (the `UNIQUE (org_id, id)`
indexes these constraints attach to).

**Status:** done and verified

- [x] All 12 references into `hr_employees`, `hr_work_shifts`,
      `bank_accounts`, `banks`, `bank_movements`, `bank_statement_imports`
      have `NOT VALID` composite FKs, then successfully
      `VALIDATE CONSTRAINT`ed
- [x] `supabase db reset` rebuilds the schema from the repository
- [x] `bank_movements`' size checked before validating; lock duration
      confirmed acceptable
- [x] Smoke check per target table: own-organization write succeeds;
      sibling-organization write rejected with a named foreign-key-violation
      error
- [x] Any reference with no caller-facing write path proven via direct SQL
      insertion instead of HTTP

## Write-up

**Migration:** `supabase/migrations/20260908100000_composite_fk_hr_banking_phase2c.sql`
— attaches each of the 6 target tables' phase-1 `UNIQUE (org_id, id)` index
as a real constraint (`ADD CONSTRAINT ... UNIQUE USING INDEX`, no re-scan),
then adds all 12 composite FKs `NOT VALID`, then `VALIDATE CONSTRAINT`s each
in its own statement. Same file, sequential statements — per ticket 02's own
empirical finding that `supabase db reset` does not wrap a migration file's
statements in one enclosing transaction, each `ADD CONSTRAINT ... NOT VALID`
commits (and releases its brief `ACCESS EXCLUSIVE` lock) before that same
constraint's `VALIDATE CONSTRAINT` statement runs later in the file. No
existing single-column FK was touched or dropped — the composite FK sits
alongside each one, exactly like the location precedent
(`20260831152632_drop_defaults_and_location_composite_keys.sql`). Every new
composite FK mirrors the `ON DELETE` action of the single-column FK it sits
next to (restrict/cascade/set null/no action, read off
`20260822141653_remote_schema.sql`), so this migration closes the
cross-tenant hole without changing parent-delete behavior.

### The 12 references (ticket 01's audit, re-confirmed against the schema)

| # | Source.column | → Target | Tier (ticket 01) |
|---|---|---|---|
| 1 | `hr_work_shifts.employee_id` | `hr_employees` | High |
| 2 | `hr_employee_payments.employee_id` | `hr_employees` | High |
| 3 | `hr_employee_documents.employee_id` | `hr_employees` | High |
| 4 | `hr_shift_attendance.registered_by_employee_id` | `hr_employees` | High |
| 5 | `cash_closings.employee_id` | `hr_employees` | Low (no client path — PIN-resolved server-side) |
| 6 | `hr_shift_attendance.work_shift_id` | `hr_work_shifts` | High |
| 7 | `bank_movements.bank_account_id` | `bank_accounts` | High |
| 8 | `bank_statement_imports.bank_account_id` | `bank_accounts` | High |
| 9 | `recurring_occurrences.payment_bank_account_id` | `bank_accounts` | High |
| 10 | `bank_accounts.bank_id` | `banks` | High |
| 11 | `bank_movement_entity_links.movement_id` | `bank_movements` | High |
| 12 | `bank_movements.statement_import_id` | `bank_statement_imports` | Low (internal — stamped by the import use case) |

### `bank_movements` size check

Local stack was seed-scale (0 rows at migration time — confirmed via
`select count(*) from bank_movements`), so it says nothing about
production. Per this spec's own risk table and
`docs/DEPLOY_SCOPED_ACCESS.md`'s identical precedent for the location
migration: `VALIDATE CONSTRAINT` takes `SHARE UPDATE EXCLUSIVE` (blocks
neither reads nor writes, only conflicts with other DDL), so the cost that
scales with row count is the validating scan's *duration*, not lock
severity. This implementation pass has no production database access, so
the production row count could not be queried directly — recorded here as
an explicit gap, not silently assumed safe. Before running this migration
against production: `select count(*) from bank_movements;` (or
`pg_stat_user_tables`/`pg_total_relation_size`), and if the count is large
enough that a several-second-to-low-minutes scan is a concern, run the
`VALIDATE CONSTRAINT` section as its own deploy step, off-peak, independent
of the `NOT VALID` adds (which are metadata-only and safe to run any time)
— the migration file's header comment records this same reasoning inline.

### Smoke check — direct SQL, all 6 target tables

`supabase db reset` was run against the local stack, then a second
organization ("Smoke Org B") plus one row per prerequisite table (location,
employee, bank, bank account, statement import, bank movement, work shift)
were inserted directly per organization, and for each of the 6 target
tables: a write naming the caller's **own** organization's identifier, then
the identical write naming the **sibling** organization's identifier.

Direct SQL was used for all 6 checks rather than mixing in HTTP, for two
reasons: (1) this repo's local Supabase stack is shared across sibling
worktrees currently implementing phases 2a/2b/2d of this same spec, and was
observed being reset concurrently mid-verification — direct SQL against a
freshly-reset, single-transaction-window database was the reliable way to
get an unambiguous result; (2) two of the six target tables' most obvious
HTTP write paths (`PATCH /api/hr/shifts/:id/attendance` for
`hr_work_shifts`, `PATCH /bank-statements/movements/:movId/reconcile` for
`bank_movements`) already do their own org-scoped existence check before
touching the database (`getWorkShiftById`/`reconcileMovement`'s lookup),
so a cross-org call 404s at the application layer and never reaches the
new constraint at all — direct SQL is what actually exercises the
database-level guarantee for those two, not a weaker substitute. This
matches ticket 21's own precedent of falling back to direct-`postgres`
insertion where the HTTP surface can't reach the column being tested.

Every check below succeeded exactly as expected — own-org insert
succeeded, sibling-org insert failed with the named FK constraint from this
migration:

| Target table | Own-org write | Sibling-org write | Constraint that fired |
|---|---|---|---|
| `hr_employees` | `INSERT` into `hr_work_shifts` — succeeded | `INSERT` into `hr_work_shifts` naming Org B's employee — rejected | `hr_work_shifts_org_id_employee_id_fkey` |
| `hr_work_shifts` | `INSERT` into `hr_shift_attendance` — succeeded | `INSERT` into `hr_shift_attendance` naming Org B's shift — rejected | `hr_shift_attendance_org_id_work_shift_id_fkey` |
| `bank_accounts` | `INSERT` into `bank_statement_imports` — succeeded | `INSERT` into `bank_statement_imports` naming Org B's account — rejected | `bank_statement_imports_org_id_bank_account_id_fkey` |
| `banks` | `INSERT` into `bank_accounts` — succeeded | `INSERT` into `bank_accounts` naming Org B's bank — rejected | `bank_accounts_org_id_bank_id_fkey` |
| `bank_movements` | `INSERT` into `bank_movement_entity_links` — succeeded | `INSERT` into `bank_movement_entity_links` naming Org B's movement — rejected | `bank_movement_entity_links_org_id_movement_id_fkey` |
| `bank_statement_imports` | `INSERT` into `bank_movements` — succeeded | `INSERT` into `bank_movements` naming Org B's import — rejected | `bank_movements_org_id_statement_import_id_fkey` |

Sample rejection (`bank_movements` → `bank_statement_imports`, reference
#12 above, the one with no caller-facing write path — proven by direct SQL
insertion as `postgres`, per the ticket's own carve-out):

```
ERROR:  insert or update on table "bank_movements" violates foreign key
constraint "bank_movements_org_id_statement_import_id_fkey"
DETAIL:  Key (org_id, statement_import_id)=(b6999cff-...,
bbbbbbbb-bbbb-...) is not present in table "bank_statement_imports".
```

All 6 named constraints match exactly what
`20260908100000_composite_fk_hr_banking_phase2c.sql` adds. The scratch SQL
script used for this smoke was not committed (matching ticket 02's own
note that its verification seed data was scratch-only).
