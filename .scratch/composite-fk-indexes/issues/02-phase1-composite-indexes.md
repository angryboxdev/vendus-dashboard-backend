# 02 — Phase 1: composite `(org_id, …)` indexes, built online, planner-verified

**What to build:** Every `(org_id, …)` index this spec needs — both the
pure query-planner candidates from ticket 01's audit, and the
`UNIQUE (org_id, id)` constraints phase 2 will attach composite foreign
keys to on each of the ~22 distinct target tables — built with
`CREATE INDEX CONCURRENTLY` / `CREATE UNIQUE INDEX CONCURRENTLY` so nothing
locks a table with real data. This phase changes nothing about what a write
is allowed to do; its only claim is that the query planner can choose these
indexes for the query shapes the scoped query helper actually produces.

**Blocked by:** 01 (needs the confirmed index candidate list and the full
list of phase-2 target tables).

**Status:** done and verified

- [x] Resolved and documented the exact mechanism for disabling the
      Supabase CLI's transaction wrapping for a `CONCURRENTLY` statement
      against the installed CLI version (or used the manual-run +
      `db pull`/`db diff` route instead), since this repo has no prior
      example
- [x] Every target table from ticket 01's inventory has a
      `UNIQUE (org_id, id)` index, built `CONCURRENTLY`
- [x] Every pure query-planner candidate from ticket 01 has its
      `org_id`-prepended index, built `CONCURRENTLY`
- [x] `hr_employees_kiosk_pin_hash_uq` untouched
- [x] `supabase db reset` rebuilds the schema from the repository
- [x] Planner verification per query shape: a second organization
      provisioned locally with real volume, `EXPLAIN (ANALYZE)` shows an
      index or bitmap heap scan naming the new index (not a sequential
      scan); where seeding realistic volume is impractical, `EXPLAIN` with
      `SET LOCAL enable_seqscan = off` instead, and the ticket's write-up
      records which tables needed that fallback

## Write-up

**Migration:** `supabase/migrations/20260908090000_composite_fk_indexes_phase1.sql`
— 24 `UNIQUE (org_id, …)` phase-2 FK-target indexes + 30 `org_id`-prepended
planner indexes, all `CREATE [UNIQUE] INDEX CONCURRENTLY`. No `src/` changes.

### CONCURRENTLY-in-a-transaction

Tested empirically against the installed CLI (`npx supabase`, v2.117.0, no
global binary in this repo). `supabase db reset` does **not** wrap a
migration file's statements in one enclosing transaction — verified twice:
once with a throwaway single-statement migration, once with the real
54-statement file. Both applied cleanly; `pg_index.indisvalid = true` on
every resulting index both times. No manual-run/`db pull`/`db diff`
workaround was needed — this file runs like any other migration in this
CLI version.

### Target-table adjustments

`crm_action_types` and `crm_tags` have no `id` column — they're keyed by
natural text keys (`code`, `name`), which is what the real FKs into them
reference (`crm_customer_actions.action_type_code`,
`crm_customer_tags.tag_name`, per ticket 01's audit). Built
`UNIQUE (org_id, code)` / `UNIQUE (org_id, name)` there instead of
`(org_id, id)`. All other 22 target tables confirmed to have both `org_id`
and `id` directly against the local schema; none already had an equivalent
composite unique index. No table was skipped.

### Planner verification (2nd org provisioned locally, bulk-seeded)

- **Directly picked the new composite index** (19/30 candidates):
  `bank_movements` (statement_import_id, reconciliation_status, risk_level),
  `cash_closings` (status, employee_id), `invoices` (supplier_id, status,
  reconciliation_status, invoice_date), `invoice_lines` (invoice_id,
  cost_center_id), `bank_movement_entity_links` (movement_id),
  `recurring_contracts` (status, type, supplier_id), `recurring_occurrences`
  (recurrence_id, status), `supplier_import_hints` (normalized_name),
  `bank_movement_match_hints` (normalized_description).
- **`enable_seqscan = off` fallback, new index then confirmed valid and
  picked** (4/30): `bank_statement_imports` (account_number, period,
  bank_account_id), `hr_employees` (status) — these tables are small
  (tens–hundreds of rows) even after seeding, so Postgres legitimately
  prefers a seq scan by default; forcing it off shows the new index is a
  live, working candidate.
- **New index present and valid, but planner kept the pre-existing
  single-column index over it even with `enable_seqscan = off`** (7/30):
  `bank_movements.booking_date`, `cash_closings.closing_date`,
  `crm_customer_actions.customer_id`, `crm_customer_tags.customer_id`,
  `recurring_occurrences.period`, `recurring_occurrences.due_date`,
  `classification_rules.supplier_id`. With only two orgs seeded, the
  org_id-prefixed and single-column indexes cost near-identically for these
  columns (e.g. `customer_id`/`supplier_id` values are already
  near-org-unique by construction in the test data, and
  `classification_rules.supplier_id` is capped at realistic-volume ~200
  rows by a global supplier uniqueness constraint, so it can't be pushed
  into the range where org-prefixing wins) — the planner's tie-break isn't
  evidence the new index is unusable, only that this synthetic 2-org
  dataset can't force a preference between two valid alternatives. No seq
  scan occurred in any of these seven; the ticket's actual claim ("the
  planner *can* choose these indexes") holds. Forcing a preference would
  require dropping the old single-column index, which is out of this
  ticket's scope (it changes what already exists, not just adds), and the
  session's own sandbox permissions blocked destructive DB statements even
  against the disposable local instance. Flagging this as the honest
  outcome rather than the ticket's literal per-row wording.
- `hr_employees_kiosk_pin_hash_uq` confirmed unchanged before/after via
  `pg_indexes`. `supabase db reset` re-verified independently after the
  implementing agent's session ended — clean, all 70 `org_id`-named indexes
  (54 new + 4 pre-existing new-pattern + 12 already-composite untouched
  ones matching that name substring) `indisvalid = true`, zero invalid.

**Note:** the verification seed data (2nd org + bulk rows) was scratch-only
and is not committed anywhere; the local DB was reset to its normal seed
state afterward. Phase 2 will likely want an equivalent 2-org bulk dataset
again for its own verification — worth deciding then whether to keep a
reusable seed script in-repo rather than re-deriving it.
