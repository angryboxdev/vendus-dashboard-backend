# 08 — Smoke verification

Status: in progress — local sweep done, remote/staging step deliberately not run (see Then)
Blocked by: 04, 06, 07
Spec: `../spec.md` (D11, "Done means")

## Problem

Spec A's headline criterion is "the app behaves identically", and **nothing
automated can check it**.

All 136 test files live under `src/modules/**/__tests__` and use fakes for the
output ports — none constructs a Supabase client, so none touches a schema.
`src/services/` (39 files: HR, CRM, stock, DRE, analytics) and `src/routes/`
have zero tests. `createClient` is called without a `<Database>` type parameter,
so `tsc` sees `.from("anything")` as valid.

**Green CI after this spec means nothing.** That is not a reason to skip CI — it
is a reason to write this checklist down and actually run it.

## Work

Run the app against the local stack (issues 01–02) with the full migration set
applied. For each area: one read and one write, checking the response matches
what the same call returned before the change.

Method: `supabase db reset` (all 4 migrations + `supabase/seeds/*.sql`), then the
real server (`tsx src/server.ts`) against `http://127.0.0.1:54321`, driven with
`curl` through a real GoTrue-issued admin JWT — not the Supabase client
directly. Every checkmark below is a live HTTP round trip through the actual
route → service/use-case → PostgREST → Postgres path, unless noted otherwise.

Modules (have unit tests, none of which touch the DB):

- [x] `cash-closings` — list (200), submit (`verify-pin` + `submit`, 201, pulls
      live Vendus + AirMenu totals), approve (`PATCH .../:id {status:"approved"}`, 200)
- [x] `invoices` — list (200), create (201), classify a line (had to
      `PATCH .../line-detail-mode {mode:"detailed"}` first — existing app
      workflow, not a bug), reconcile (linked to a bank-statement movement,
      `reconciliationStatus` → `reconciled`)
- [x] `payable-entries` — list, create (201), and `/paid` (200, bonus)
- [x] `payable-recurrences` — create a contract (201), list contracts (200),
      generate an occurrence (`POST .../occurrences/generate {year,month}`, 201)
- [x] `bank-statements` — import a statement (CSV upload matched an existing
      seeded bank account via account number, 201), match/link a movement to a
      `payable_entry` and to an `invoice` via `PATCH .../reconcile` (204 both,
      confirms the D6 `(org_id, deduplication_hash)` dedup constraint)
- [x] `bank-accounts` — list banks (200), create a bank (201), create an
      account under it (201)
- [x] `financial-base` — cost centers (read + a `custos-fixos` create),
      suppliers (list/create/KPIs), **PDF header (issue 04)**: `GET
      .../statement-pdf` returns a valid 2-page PDF (200); confirmed via direct
      query that `organizations` holds the real Angrybox row and
      `src/config/company.ts` is gone
- [x] `vendus` — summary (200, live Vendus data), KPIs
      (`/vendus/analytics/current`, 200), analytics cache write
      (`/vendus/analytics/historical` populated 19 rows in
      `analytics_monthly_cache`; **re-ran it — still 19 rows, no error** — this
      is the live, through-the-app confirmation of issue 07's upsert fix that
      issue 07's own audit could only get via direct `supabase-js`)
- [x] `air-menu` (enterprises + summary, live data), `kds` (deliveries, live
      data), `financial-obligations` (list) — all 200
- [x] `tasks` — **not reachable**: no `createTasksModule` wiring exists in
      `src/server.ts` at all. Confirmed this is pre-existing on `main`, not a
      regression — the reference module has simply never been mounted.

Legacy services (**zero tests — the real risk surface**):

- [x] HR: employees (list/create, 201), shifts (list/create for today, 201),
      attendance (via kiosk check-in, see below), leave (holidays/overview/
      per-employee list/request, 201), payments (list/create, 201 — field is
      `paymentType` not `type`), audit log (`GET /hr/audit-logs`, 200 —
      confirmed it actually recorded the kiosk check-in event below)
  - [ ] documents — not exercised (multipart upload to a Storage bucket that
        doesn't exist locally; same gap as supplier invoice import below)
- [x] HR kiosk: daily token (200), scan check-in (200 — live confirmation of
      issue 07's `onConflict: "work_shift_id"` fix on `hr_shift_attendance`
      through the real endpoint, not just direct `supabase-js`)
  - [ ] scan check-out — hit `hr_shift_attendance_actual_order` (check-out must
        be strictly after check-in). Confirmed this constraint is **already in
        the baseline** (`20260822141653_remote_schema.sql:685`), untouched by
        any spec A migration — a same-minute check-in/check-out is a
        pre-existing edge case, not a regression. Not re-verified with a real
        time gap for lack of a way to wait a minute mid-session.
- [x] CRM: customers (list, tags, orders, contacts, scripts, parameters — all
      200/201). **Found a bug, but it's in the local seed, not spec A**:
      `nextCustomerId()` (`crmCustomerService.ts:71`) does
      `parseInt(lastId.replace("C",""))`, which expects production's `C001`
      style IDs. Issue 02's local seed uses `CUST0001`, so `parseInt("UST0001")`
      → `NaN` → a customer gets created as id `"CNaN"`. Deleted the bad row;
      re-ran the same create/tag/order flow against a real seeded customer
      (`CUST0002`) and it worked. **Flagging for whoever picks up issue 02**:
      either reseed with `C001`-style ids, or accept that local customer
      creation is broken until then. Not a spec A finding — D7 explicitly
      leaves the CRM text-PK structure alone.
- [x] Stock: items (list/create, 201), categories (list), movements
      (create — purchase, 201), preparations (list/create, 201), quantities
      RPC (`current_quantity` on item read, derived correctly post-write)
- [x] Pizzas: list (200), create (201). Prices/recipes/recipe-items not
      exercised (time; the list read alone confirms the table/joins survived
      the schema pass)
- [x] DRE: receita bruta (200, live Vendus data), custos fixos (list +
      create, 201), custos variáveis (list, 200 — create not exercised), KPIs
      (200)
- [ ] Supplier invoice import: upload failed with `"Bucket not found"` — no
      Storage bucket is provisioned in the local stack. Storage is explicitly
      **out of scope** for spec A (spec.md, "Out of scope" — storage
      org-prefixing is spec B's problem), and issues 01/02 never created one
      either. Parse/map article/adjust stock therefore not exercised.
- [x] Vendus mapping — confirmed the D6 `(org_id, match_by, match_value)`
      unique constraint live (`\d vendus_product_mapping` on the local DB);
      exercised the org-scoped lookup for real via the `stock:adjust-from-lines`
      job below (one seeded mapping, one clean "not found" for an unmapped
      reference — no SQL error either way)

Jobs:

- [x] `cron:daily-vendus-consumption` — ran end to end, dry-run and for real,
      against yesterday's real Vendus sales. The real run initially failed
      with a `stock_movements_item_id_fkey` violation: `consumableConsumptionService.ts`
      hardcodes 6 production `stock_item` UUIDs (`CONSUMABLE_IDS`) for
      pratos/caixas/sacolas/guardanapos, and none of them exist in the local
      seed. Inserted 6 matching local rows to unblock verification, then
      re-ran clean: 5 movements inserted, `org_id`/`location_id` correctly
      defaulted, **and a second run was idempotent** (`deleted_rows: 5`,
      re-inserted 5, no duplicates). Not a spec A bug — flagging the seed gap
      for issue 02.
- [x] `stock:adjust-from-lines` — same story: the example lines file
      (`docs/stock-adjustment-lines.example.json`) references real production
      Vendus item references with no local `vendus_product_mapping` rows.
      Seeded one mapping, ran a single-line file for real: inserted an
      `adjustment` movement with `org_id`/`location_id` correctly defaulted.

## Then

- [x] `supabase db diff --linked` — near-clean. The only diff is
      `revoke`/`grant execute on function custom_access_token_hook` for
      `anon`/`authenticated` — a cosmetic GRANT-ordering artifact from the
      **baseline** migration (`20260822141653_remote_schema.sql`, untouched by
      any of the 3 tenancy/RLS migrations). Not schema drift from this spec's
      work.
- [x] `supabase db push --dry-run` — reports `{"upToDate":true,"migrations":[]}`.
- [x] `supabase db push` — **already applied**. `supabase migration list`
      shows all 4 local migrations (baseline, `tenant_root_tables`,
      `tenancy_schema_pass`, `hr_rls_deny_by_default`) as applied on the
      linked project's remote ledger already, before this ticket touched
      anything — I ran nothing against remote except the two read-only
      commands above (plus `migration list`) and a **local-only** `db reset`.
      This must have happened in an earlier turn on this branch. Worth
      double-checking with whoever ran it.
- [ ] Re-run the module smoke checks against staging — **deliberately not
      done.** `supabase status` shows the linked project is `angry-box-dev`
      (ref `oobplqewonmitnesvlsl`), created **today** — separate from
      `Angry Box DRE` (ref `frbxmerhgnvhocwpuzrq`, created Feb 2026, not
      linked), which is the far more likely candidate for real production.
      That strongly suggests `angry-box-dev` is a disposable staging clone
      created for exactly this spec's work, not the live database — but I
      have no explicit doc confirming that, and running write smoke checks
      (creating suppliers, invoices, employees, etc., same as the local sweep
      above) against a live hosted project is an outward-facing, hard-to-undo
      action I'm not treating as pre-authorized. **Needs a human call before
      anyone runs this**, either way — confirm `angry-box-dev` is safe to
      write into, or point at the right project.

## Done when

- [ ] Every box above is ticked, by someone who ran it rather than reasoned
      about it — **local sweep: yes. Staging: no, see Then.**
- [x] Anything that broke is fixed and re-verified, for everything spec A
      actually touches. The three things this sweep found broken are all
      pre-existing and out of spec A's scope, and are flagged above rather
      than silently fixed: the `tasks` module wiring gap, the
      `hr_shift_attendance_actual_order` same-minute edge case, and the CRM
      `CUST00xx` vs. `C0xx` id-format mismatch (issue 02's seed vs. legacy
      `nextCustomerId()`). No Storage bucket locally is a known, accepted gap
      (Storage is out of scope for spec A).
