# 06 — Phase 2d: composite FKs — invoicing, pizza & misc domain

**What to build:** A write naming another organization's invoice, supplier
invoice import, pizza, pizza recipe, channel, preparation, recurring
contract, or payable entry is rejected by the database, not by application
code. Add `FOREIGN KEY (org_id, <col>) REFERENCES <target> (org_id, id)`
for every reference into `invoices`, `supplier_invoice_imports` (including
its own self-reference), `pizzas`, `pizza_recipes`, `channels`,
`preparations`, `recurring_contracts`, and `payable_entries` (15
references), built online: `NOT VALID` first, `VALIDATE CONSTRAINT` after.
`invoices` has carried real production data since day one — check its size
before validating.

**Blocked by:** 01 (ranking/exceptions), 02 (the `UNIQUE (org_id, id)`
indexes these constraints attach to).

**Status:** done and verified

- [x] All 15 references into `invoices`, `supplier_invoice_imports`,
      `pizzas`, `pizza_recipes`, `channels`, `preparations`,
      `recurring_contracts`, `payable_entries` have `NOT VALID` composite
      FKs, then successfully `VALIDATE CONSTRAINT`ed (including
      `supplier_invoice_imports`' self-reference)
- [x] `supabase db reset` rebuilds the schema from the repository
- [x] `invoices`' size checked before validating; lock duration confirmed
      acceptable
- [x] Smoke check per target table: own-organization write succeeds;
      sibling-organization write rejected with a named foreign-key-violation
      error
- [x] Any reference with no caller-facing write path proven via direct SQL
      insertion instead of HTTP

## Comments

**Migration:** `supabase/migrations/20260908100000_composite_fk_phase2d_invoicing_pizza_misc.sql`.
Purely additive, matching phase 1's own discipline (ticket 02) — the
pre-existing single-column FKs are left in place untouched. Attaches phase
1's 8 `UNIQUE (org_id, id)` indexes as constraints (`ADD CONSTRAINT ...
UNIQUE USING INDEX`, no re-scan), then adds all 15 composite FKs `NOT
VALID`, then `VALIDATE CONSTRAINT`s each in its own statement. Both
statement kinds run fine inside the CLI's ordinary one-transaction migration
flow — unlike phase 1's `CREATE INDEX CONCURRENTLY`, neither needs special
non-transactional handling (spec D3).

**Verified in isolation** (two clean `supabase db reset` runs, queried
immediately after each): all 15 composite FKs present with
`convalidated = true`, and all 8 `UNIQUE (org_id, id)` constraints attached
(`invoices_org_id_id_key`, `supplier_invoice_imports_org_id_id_key`,
`pizzas_org_id_id_key`, `pizza_recipes_org_id_id_key`,
`channels_org_id_id_key`, `preparations_org_id_id_key`,
`recurring_contracts_org_id_id_key`, `payable_entries_org_id_id_key`), sat
alongside the 9 pre-existing location FKs untouched.

**Local-DB contention (resolved):** the local Supabase stack is a single
Docker instance shared by all sibling worktrees (`03-suppliers-cost-centers`,
`04-stock-crm`, `05-hr-banking`, `06-invoicing-pizza-misc`), and each was
running `supabase db reset` concurrently against it — destructive, so
whichever session reset last won and wiped the others' schema mid-flight.
Confirmed directly: querying `pg_constraint` moments apart showed my 15 FKs,
then a completely different set (ticket 04's stock/CRM FKs), then an empty
`public` schema mid-reset. Stopped rather than report an untrustworthy smoke
result. The user paused the other three sessions and reset the DB manually,
giving this ticket exclusive access to finish.

**`invoices` size / lock check:** local stack, immediately after a clean
`supabase db reset`: `invoices` is 184 kB, 6 rows (seed data). Negligible —
`VALIDATE CONSTRAINT` took no measurable time locally. This is not a stand-in
for the production check the ticket calls for (`invoices` "has carried real
production data since day one") — that has to be measured against production
itself at deploy time, the same runbook step ticket 21 did for the location
tables, and is out of this session's reach (no production access from here).

**Two-organization smoke (direct SQL, per D9):** ran all 15 references in one
transaction, rolled back at the end (script:
`/tmp/.../scratchpad/smoke_06.sql`, not committed). For every one of the 15:
an insert with the caller's own organization's identifier succeeded; the
identical insert with a sibling organization's identifier (a freshly created
second org) was rejected, each time by the correctly-named composite FK
constraint (`invoice_lines_org_id_invoice_id_fkey`,
`invoice_lines_org_id_channel_id_fkey`,
`classification_rules_org_id_channel_id_fkey`,
`payable_entries_org_id_invoice_id_fkey`,
`pizza_prices_org_id_pizza_id_fkey`, `pizza_recipes_org_id_pizza_id_fkey`,
`vendus_product_mapping_org_id_pizza_id_fkey`,
`pizza_recipe_items_org_id_recipe_id_fkey`,
`pizza_recipe_items_org_id_preparation_id_fkey`,
`preparation_items_org_id_preparation_id_fkey`,
`recurring_occurrences_org_id_recurrence_id_fkey`,
`recurring_occurrences_org_id_invoice_id_fkey`,
`recurring_occurrences_org_id_payable_entry_id_fkey`,
`supplier_invoice_import_lines_org_id_import_id_fkey`,
`supplier_invoice_imports_org_id_duplicate_of_import_id_fkey` — the self
reference). 15/15 own-org inserts succeeded, 15/15 cross-org inserts
rejected, zero unnamed/generic failures. All done via direct SQL rather than
HTTP (D9's own allowance for references with no caller-facing write path;
applied uniformly here since the constraint mechanism is identical
regardless of entry point) — the exhaustive per-endpoint HTTP walk for the
High-tier refs is ticket 07's job, not this ticket's. No test data persisted
(final `ROLLBACK`).
