# Deploy order: scoped access (dropping the column-default scaffold)

This migration (`supabase/migrations/20260831152632_drop_defaults_and_location_composite_keys.sql`)
drops the `org_id` and `location_id` column defaults that have let a
half-migrated system keep working, and adds the location composite foreign
keys (ADR-0009). It is the irreversible step of `.scratch/scoped-access/spec.md`:
afterwards, a write that does not name an organization fails at the database
instead of silently landing on Angrybox.

## Order

1. **The front end is already deployed and sending a `location` on every
   write to the five location-bearing tables** (stock movements, work
   shifts, shift attendance, cash closings, invoice lines — ticket 19). This
   is a **precondition, not a step**. If it is not true, stop: this
   migration must not run yet.
2. **The back end is already deployed with every write path supplying an
   organization explicitly** (tickets 02-18), and the `supabase-so-no-scoped-db`
   dependency-cruiser rule is at `error` with zero violations (ticket 20).
3. **Run the migration.**
4. **Re-run the smoke against production**, for the single existing
   organization: the kiosk, the till closing, a stock movement, a shift and
   an invoice line.

**Only step 1 must precede step 3.** Getting it wrong breaks every stock,
shift and attendance write at once: the column default is the only thing
standing between "no location supplied" and a `NOT NULL` violation on
`location_id`, and once the front end ships that default is no longer load
bearing but is also not yet gone — only step 3 removes it.

## Why the order, restated

While the column defaults exist, a half-migrated system is fully working: a
converted write path passes `org_id`/`location_id` explicitly, an
unconverted one still receives them from the default (D12). Dropping the
defaults is what makes "every write path supplies an organization" an
enforced property instead of a hopeful one — which is why it has to be last,
and why it cannot run until the thing it stops tolerating (a write with no
location) can no longer legitimately happen.

## What this migration cannot roll back

Dropping a column default is reversible (re-add it). The composite foreign
keys are not what makes this migration irreversible — **the column-default
drop is**: any write in flight during the deploy window that does not
already carry an organization or location will fail instead of silently
succeeding. There is no "put the default back and pretend this didn't
happen" once real writes have started depending on the new failure mode.

## Before running against production

Dropping a column default is metadata-only and fast. The five composite
foreign keys are not: each requires a validating scan of its table
(`cash_closings`, `stock_movements`, `hr_work_shifts`, `hr_shift_attendance`,
`invoice_lines`) to confirm every existing row already satisfies it. Check
those table sizes before running this migration against production, rather
than discovering the lock duration live. (On the local stack, with the
seed-scale fixtures, this step is instant — production may not be.)

## Known failure signature: a write with no location, after the migration

If step 1 was skipped or missed a write path, that path will start failing
with a `NOT NULL` violation on `location_id` (event-grain tables) or a
foreign key violation on the new composite key (if it sends a stale/wrong
location). This is deliberate — the same failure mode ADR-0009 exists to
create — but if it appears on a path nobody expected, that path is the one
ticket 19 didn't convert. Check the front end's write payload for that
endpoint first.

## Do not provision a second organization in production yet

This migration removes one of the four reasons production stays
single-organization (composite location keys), but it does not lift the
gate. See `.scratch/scoped-access/issues/21-drop-defaults-composite-keys-and-smoke.md`
("Not in scope") and the deferred register in `.scratch/org-location-foundation/spec.md`
for the remaining blockers. `src/jobs/runOrganizationProvisioning.ts` prints
the gate banner on every run as a reminder; it does not enforce it.
