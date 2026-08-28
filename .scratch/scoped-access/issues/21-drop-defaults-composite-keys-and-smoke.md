# 21 — Migration: drop both default families, add the location composite keys; two-organization smoke; deploy runbook

Status: ready-for-agent
Blocked by: 19, 20
Spec: `../spec.md` (D3, D5, D11, D12), ADR-0009

## Problem

The column defaults spec A installed are the scaffold that has kept a
half-migrated system working: an unconverted write still got stamped with
Angrybox. Every write path now supplies an organization explicitly, so the
scaffold is the last thing making an unscoped write *possible*.

Dropping it is the contract step. Afterwards a write that does not name an
organization fails, which is the property this spec exists to deliver — and it is
also the only irreversible thing in the spec.

## Work

1. **One migration**, containing:
   - drop the organization column defaults on every table that carries one;
   - drop the location column defaults on the four event-grain tables;
   - add a uniqueness constraint on the location's organization-and-identifier
     pair;
   - add composite foreign keys from each of the five location-bearing tables to
     it, so a row can only reference a location belonging to its own organization
     (D5).
2. **The two-organization smoke**, against the local stack, written up as a
   deliverable document in the manner of B1's token-hook verification — not
   automated into the test suite (D11).
3. **The deploy runbook**, recording the order and why it matters.

## The smoke, in full

Provision a second organization with the existing script, then verify:

- a user of each organization sees only their own records in every listing;
- fetching by an identifier belonging to the other organization behaves as not
  found;
- updating by such an identifier changes nothing;
- deleting by such an identifier deletes nothing;
- a write naming a location belonging to the other organization is **rejected by
  the database**, not by application code;
- creating a record attributes it to the caller's organization with no field on
  the wire saying so;
- the kiosk clock-in and the till closing behave exactly as before;
- both scheduled jobs write into the organization named by the unattended scope;
- a write constructed to omit an organization **fails**, where before this
  migration it would have succeeded silently.

## Deploy order

1. The front end is already deployed and sending a location (ticket 19). **This is
   a precondition, not a step** — if it is not true, stop.
2. The back end is already deployed with every path supplying an organization
   (tickets 02–18) and the rule at `error` (ticket 20).
3. Run the migration.
4. Re-run the smoke against production for the single existing organization: the
   kiosk, the till closing, a stock movement, a shift and an invoice line.

Only step 1 must precede step 3. Getting it wrong breaks every stock, shift and
attendance write at once.

## Not in scope

The second organization is provisioned **on the local stack only**. Spec A's gate
still stands: no second `organizations` row in production until the deferred
register's first group lands. This ticket does not lift that gate — it removes one
of the reasons the gate existed, and the register records the rest.

## Notes

- **Green tests are not evidence this migration is correct.** Every test file uses
  fakes, none constructs a database client, and the client is untyped, so a
  misspelled table name compiles. This is spec A's D11 caveat and it matters more
  here than anywhere else in the spec. Verify against the local stack.
- The composite keys added here are only the location ones. The other 65 stay
  behind the gate, for the reason rewritten into the register by ticket 20 — every
  write endpoint accepting an identifier is an unvalidated cross-tenant reference,
  and the composite key is the only structural fix.
- Dropping a column default is metadata-only and fast; the composite foreign keys
  require a validating scan of five tables. Check their sizes before running this
  against production rather than discovering the lock duration live.

## Done when

- [ ] Both families of column default are dropped
- [ ] The location uniqueness constraint and the five composite foreign keys exist
- [ ] `supabase db reset` rebuilds the schema from the repository, and
      `db diff --linked` shows no drift
- [ ] A second organization exists on the local stack, provisioned by the script
- [ ] Every item in the smoke list above is verified and written up
- [ ] A write that names no organization fails
- [ ] A write naming another organization's location is rejected by the database
- [ ] The runbook is recorded, with the front-end precondition stated first
- [ ] Production behaves identically for the existing organization after the
      migration
