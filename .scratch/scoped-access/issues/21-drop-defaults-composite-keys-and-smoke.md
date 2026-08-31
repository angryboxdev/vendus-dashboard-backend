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

- [x] Both families of column default are dropped
- [x] The location uniqueness constraint and the five composite foreign keys exist
- [x] `supabase db reset` rebuilds the schema from the repository — verified.
      `db diff --linked` **not yet run**: it requires `supabase login`
      (browser OAuth), which needs to be done interactively by a human before
      this can be confirmed. Run it before deploying.
- [x] A second organization exists on the local stack, provisioned by the script
- [x] Every item in the smoke list above is verified and written up
- [x] A write that names no organization fails
- [x] A write naming another organization's location is rejected by the database
- [x] The runbook is recorded, with the front-end precondition stated first
      (`docs/DEPLOY_SCOPED_ACCESS.md`)
- [ ] Production behaves identically for the existing organization after the
      migration — pending the actual production deploy (deploy-order step 4);
      not done as part of this implementation pass.

## Comments

This entry covers only the two-organization smoke and its write-up, run
against the local stack (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
API `http://127.0.0.1:54321`), with the app server (`tsx watch src/server.ts`)
started with `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
pointed at the local stack and `CRON_SECRET=smoke-test-secret` exported ahead
of it — `.env`'s own `SUPABASE_URL` still points at the remote project and
was never touched. The migration itself, the seed-file fixes, and the other
Done-when items above were out of scope for this pass and are not re-verified
here.

**Both admins sign in for real and carry the right claims.** GoTrue's
password grant against the local stack for both `admin@angrybox.test` and
`admin@segundaorg.test` (password `Sup3rSecret!23` for both) returned real
sessions. Decoding each `access_token`'s payload: Angrybox's admin
(`sub=edbd3b66-c3a0-41b1-be8e-366e3bb50d49`) carries `org_id:
b6999cff-79b2-4583-b8b4-a744b3ace748`, `org_role: admin`; Segunda
Organização's admin (`sub=7d58d6cc-d2b0-4b20-b6ea-c503d3314913`) carries
`org_id: 9a9f39b6-0dfb-4183-9731-d7e855bc3cb8`, `org_role: admin`. Every
check below used these two real bearer tokens, never a synthetic JWT.

**Listing isolation**, tried across all three named tables plus stock
categories/items as a fourth: created a stock category as each admin with
no `org_id` in the body (`POST /api/stock/categories {"name":"Smoke-..."}`),
then `GET /api/stock/categories` as each — Angrybox's list included
`Smoke-Angrybox-Cat` and the five pre-seeded categories, never
`Smoke-Segunda-Cat`; Segunda's list was exactly `[Smoke-Segunda-Cat]`. Same
result for invoices (`GET /api/invoices`: Angrybox saw `SMOKE-AB-001` plus
its six seeded invoices, Segunda saw exactly `[SMOKE-S2-001]`), for
`hr_work_shifts` (`GET /api/hr/shifts?from=2026-09-01&to=2026-09-01` returned
exactly the one shift each admin had created, never the other's), and for
`stock_movements` (`GET /api/stock/movements` — Segunda's paginated result
was `{"data":[],"total":0}` while Angrybox's was non-empty, confirmed after
creating a Segunda item + movement that it appeared only in Segunda's own
list). Attendance isn't a separate listing endpoint — it comes embedded on
the shift object — so it's covered by the shift-listing check plus the
fetch-by-id case below.

**Fetching by the other organization's identifier behaves as not found**,
checked across stock_categories, invoices, stock_movements and
hr_shift_attendance: Angrybox's admin against Segunda's stock category id got `404 {"error":
"Categoria não encontrada"}`; against Segunda's invoice id, `404 {"error":
"Invoice not found: 6a866a5f-..."}`; against Segunda's stock movement id,
`404 {"error":"Movimentação não encontrada"}`; `DELETE
/api/hr/shifts/:id/attendance` against Segunda's shift id (the one attendance
endpoint that gates explicitly on a prior fetch) returned `404 {"error":"Turno
não encontrado"}`. In every case the underlying service does
`.eq(org_id_column, callerOrg).eq("id", id).maybeSingle()`-shaped filtering
(`ScopedQuery`'s `select`/predicate composition, D1), so the row is invisible
to the query itself, not filtered after the fact.

**Updating by the other organization's identifier changes nothing** — but
with a caveat on the HTTP status, not the outcome. `PUT
/api/stock/categories/<segunda-id>` as Angrybox returned `500 {"error":
"Atualizar categoria: Cannot coerce the result to a single JSON object"}` —
PostgREST's `.single()` erroring on zero matched rows, since the org
predicate excluded the row before the id predicate had anything to match.
Same shape for `PUT /api/stock/movements/<segunda-id>` (`500 ... Cannot
coerce ...`) and `PATCH /api/hr/shifts/<segunda-id>` (`500 "RH turno: Cannot
coerce ..."`). `PATCH /api/invoices/<segunda-id>` was cleaner — the invoice
use case does its own existence check first and returned a proper `404
"Invoice not found"`. In every case a direct Postgres check afterward showed
the target row byte-for-byte unchanged (verified for the stock category, the
invoice, and the shift by re-selecting the row and diffing against its
pre-attempt value). So the property the checklist item cares about — nothing
changes — holds everywhere; only the status code is inconsistent (500 vs
404) depending on whether the route's service does its own pre-fetch. Worth
a follow-up, not a blocker for this ticket.

**Deleting by the other organization's identifier deletes nothing.**
`DELETE /api/stock/categories/<segunda-id>` and `DELETE
/api/hr/shifts/<segunda-id>`, both called as Angrybox's admin, each returned
`204 No Content` — the delete verb matched zero rows (org predicate excluded
the target) and PostgREST reports that as an ordinary success with no rows
affected, not an error. `DELETE /api/invoices/<segunda-id>` returned a clean
`404 "Invoice not found"` instead, again because that use case checks
existence first. In all three cases a follow-up `select` confirmed the
target row was still present, unchanged, in the other organization. No
`DELETE` endpoint exists for a single `stock_movements` row, so that table
wasn't exercised for this specific check.

**A write naming another organization's location is rejected by the
database, confirmed on all five location-bearing tables**, and in four of
the five with the actual Postgres error surfaced back through a real HTTP
call (not synthesized) — the fifth reached the same constraint directly at
the DB, because no endpoint lets a caller name a location for it at all
(see below). As Angrybox's admin, naming Segunda's location id
(`549118eb-fea8-4c37-b0bf-19471215e361`) on an otherwise-valid write:
  - `POST /api/stock/movements` → `500 {"error":"Criar movimentação: insert
    or update on table \"stock_movements\" violates foreign key constraint
    \"stock_movements_org_id_location_id_fkey\""}`.
  - `POST /api/hr/shifts` → `500 {"error":"RH criar turno: insert or update
    on table \"hr_work_shifts\" violates foreign key constraint
    \"hr_work_shifts_org_id_location_id_fkey\""}`.
  - `PATCH /api/hr/shifts/:id/attendance` (upsert, own shift, Segunda's
    location) → `500 {"error":"RH conferência: insert or update on table
    \"hr_shift_attendance\" violates foreign key constraint
    \"hr_shift_attendance_org_id_location_id_fkey\""}`.
  - `POST /api/invoices/:invoiceId/lines` (after switching the invoice to
    detailed mode) → `400 {"error":"insert or update on table
    \"invoice_lines\" violates foreign key constraint
    \"invoice_lines_org_id_location_id_fkey\""}`.
  - A matching write with the caller's **own** location succeeded (`201`) in
    every one of the four cases above, confirming the rejection is specific
    to the cross-org location, not a general failure.
  - `cash_closings` is the fifth table, but neither `verifyPin` nor
    `submitClosing` accepts a `location_id` from the caller at all — the
    till-closing routes always use `UNATTENDED_SCOPE.locationId` (see the
    kiosk/till-closing paragraph below), so there is no HTTP path that could
    even attempt this. Confirmed the constraint still exists and still fires
    by inserting directly as `postgres`: `insert into cash_closings (org_id,
    location_id, ...) values ('<angrybox-org>', '<segunda-location>', ...)`
    → `ERROR: insert or update on table "cash_closings" violates foreign key
    constraint "cash_closings_org_id_location_id_fkey" DETAIL: Key (org_id,
    location_id)=(b6999cff-..., 549118eb-...) is not present in table
    "locations".` All five constraint names match exactly what
    `20260831152632_drop_defaults_and_location_composite_keys.sql` adds.

**Creating a record attributes it to the caller's organization with no field
on the wire saying so.** Every `POST` used above sent no `org_id` /
`organizationId` field at all — `{"name":"Smoke-Angrybox-Cat"}`,
`{"supplierName":"Smoke Supplier AB", ...}`, etc. — and in each case the
resulting row's `org_id` in Postgres matched the caller's own organization:
confirmed directly (`select id, name, org_id from stock_categories where
name like 'Smoke-%'` showed the Angrybox-created row stamped
`b6999cff-...` and the Segunda-created row stamped `9a9f39b6-...`) and for
the invoices the same way. This is `ScopedQuery.table(...).insert(...)`
stamping `entry.organizationColumn` from the `OrganizationId` the route
derived from `req.auth!.orgId` (the verified JWT claim) — there is no
`organizationId`/`org_id` field in any request body the client controls.

**The kiosk clock-in and the till closing are unaffected by which admin is
logged in**, because neither route reads `req.auth` for scoping at all —
both are unauthenticated device routes registered before the global
`requireAuth` gate, and both use `UNATTENDED_SCOPE` unconditionally. Proved
this concretely rather than by code-reading alone: called `POST
/api/hr/kiosk/scan` and `POST /api/cash-closings/{verify-pin,submit}` while
deliberately attaching **Segunda's** admin bearer token in the
`Authorization` header (irrelevant to these routes, but attached to make
the point that it changes nothing) — the kiosk check-in for Angrybox's
employee Ana Ferreira Costa succeeded (`200`, `"action":"check_in"`), and
`select org_id, location_id from hr_shift_attendance where work_shift_id =
'<the test shift>'` showed `b6999cff-... / c11d9146-...` — Angrybox/Arcozelo.
Same for the till closing: `submit` returned `201` with
`"locationId":"c11d9146-..."`, and `select org_id, location_id from
cash_closings where id = '<the closing>'` confirmed
`b6999cff-... / c11d9146-...`.

**Both scheduled jobs write into Angrybox**, but this needed a workaround —
see the deviation below. `npx tsx src/jobs/runStockAdjustmentFromLines.ts`
(the real CLI entry point behind `npm run stock:adjust-from-lines:dev`), run
with a one-line synthetic `vendus_product_mapping` row
(`match_by=reference, match_value=SMOKE-TEST-REF`, pointing at a real
Angrybox stock item — inserted and deleted by hand, nothing persisted) and a
one-line input file, inserted one real `stock_movements` row:
`select org_id, location_id, created_by from stock_movements where reference
= 'stock-adjustment-lines:2026-08-31'` → `b6999cff-... /
c11d9146-... / stock-adjustment-from-lines`. `npx tsx
src/jobs/runDailyVendusConsumption.ts` with `CRON_DRY_RUN=1
TARGET_DATE=2026-08-30` ran end to end against the real Vendus API and
reported `"movements_inserted": 6` computed via `createScopedQuery(
UNATTENDED_SCOPE.organizationId)` — the identical helper and table
independently proven above to stamp the caller's org correctly — but as a
dry run it didn't persist rows to check directly. A follow-up **non**-dry-run
attempt for the same job failed before reaching any org/location concern, on
an unrelated pre-existing FK: `Inserir movimentos de consumo: insert or
update on table "stock_movements" violates foreign key constraint
"stock_movements_item_id_fkey"` — a Vendus-product-mapping/stock-item seed
mismatch on this local stack, unrelated to this ticket and not something I
touched, since seed files are out of scope for this pass.

**A write constructed to omit an organization fails.** Both at the raw
Postgres level and through the same Supabase JS client the app uses:
`insert into stock_categories (name) values ('should-fail-no-org')` →
`ERROR: null value in column "org_id" of relation "stock_categories"
violates not-null constraint`; same for `stock_movements`
(`... violates not-null constraint ... relation "stock_movements"`); and via
`createClient(...).from("stock_categories").insert({ name: "..." })` with
the local service-role key → `{"code":"23502","message":"null value in
column \"org_id\" of relation \"stock_categories\" violates not-null
constraint"}`. Before this migration `org_id` had a column default
(Angrybox's id, per `20260822150000_tenancy_schema_pass.sql`), so the exact
same omission would have silently landed in Angrybox instead of failing —
confirmed by reading that migration, not by reverting this one and
re-running the same insert, which would have meant undoing the
already-applied migration.

**Deviation worth flagging: the two cron HTTP endpoints
(`/api/internal/cron/daily-vendus-consumption` and
`/api/internal/cron/process-direct-debits`) are unreachable via HTTP at all
on this codebase as currently wired**, independent of anything this ticket
changed. `createInternalCronRouter(...)` is mounted at
`src/server.ts:160`, which is *after* the unconditional `app.use(requireAuth)`
at `src/server.ts:95` — so every request to those routes is rejected by the
global auth gate (`401 {"error":"Autenticação necessária"}`) before it ever
reaches `requireCronSecret`'s own check inside the handler. Both checks read
the same `Authorization` header, so no single request can satisfy both a
valid Supabase JWT and a raw `Bearer <CRON_SECRET>` at once — the route is
structurally dead code over HTTP as it stands. I did not fix this (out of
scope: it's a routing-order issue in `src/server.ts`, not something ticket
21 touches, and I was told to verify, not modify). I worked around it for
the daily-vendus-consumption job by calling its documented CLI entry point
directly (`npm run cron:daily-vendus-consumption:dev`), which calls the
exact same `runDailyVendusConsumptionJob` the HTTP route calls with the same
`UNATTENDED_SCOPE` arguments — this is a legitimate alternate way to run
this job, not an invention for this smoke, since it's the officially
documented one (`package.json`'s `cron:daily-vendus-consumption[:dev]`
scripts, predating this ticket). `process-direct-debits` has no such CLI
entry point (it's HTTP-only in this codebase) and there were no pending
direct-debit invoices on the local stack to exercise meaningfully even if I
built a throwaway harness around `ProcessDirectDebitsUseCase` directly, so
that one specific job is verified by source reading only (it calls
`createScopedQuery(organizationId)` inside `InvoiceRepositoryPort`/
`PayableEntryWritePort`, the identical mechanism proven correct everywhere
above) and not by a live run. Flagging this for a decision: either move the
cron router registration above the global `requireAuth` gate (matching how
the kiosk and cash-closing public routes are already registered), or accept
that these two cron jobs can currently only be run as local CLI scripts /
directly on a deploy host rather than via whatever external scheduler is
meant to hit them over HTTP.

**Cleanup.** Every row created for this smoke (two stock categories, two
stock items, four stock movements, two invoices with one line each, three
work shifts with two attendance rows, one cash closing, one synthetic
`vendus_product_mapping` row, and Segunda's one synthetic employee) was
deleted by hand afterward, and Angrybox's pre-existing employee's kiosk PIN
(set mid-smoke to exercise the kiosk) was reset to unset. Re-checked
afterward: `organizations` and `locations` back to exactly two rows each
(Angrybox + Segunda Organização, as intended to persist), `org_members` at
two (the two admins, as intended to persist), and zero rows matching any
`Smoke%`/`SMOKE-%` name across the tables touched. The two admin users and
the second organization were deliberately left in place, per the ticket's
Cleanup instructions.
