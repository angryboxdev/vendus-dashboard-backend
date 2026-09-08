# 07 — Embedded-select review (D8)

> Scope: review the embedded `.select(...)` call sites already in the
> codebase in light of this spec's composite-FK migrations — not a
> from-scratch re-audit (Out of Scope, spec.md). Read-only review; no source
> changes made here.

## Method

Grepped `src/` for every `.select(...)` call (260 total call sites across 87
files), then for each extracted the select-string argument — resolving it
through a local variable/constant when the call passed one instead of a
literal — and flagged any argument containing a nested `identifier(` inside
it (the PostgREST embed giveaway). Every hit was then read in its
surrounding function to confirm it really follows a foreign key from an
already-org-filtered parent (not a plain multi-column select, and not
already `.eq("org_id", …)`-guarded on the embedded side — none found are).
Cross-checked each relationship's source/target columns against the ranked
FK list (`issues/01-...md`) and grepped the four phase-2 migration files for
the exact `ADD CONSTRAINT ... FOREIGN KEY (org_id, ...)` and matching
`VALIDATE CONSTRAINT` statements.

## Headline result

**17 embedded-select call sites found, across 5 distinct FK relationships —
not 14.** All 5 relationships are inside the ~65-FK / ~22-target-table
inventory phase 2 covered (Further Notes of spec.md); none is one of D6's
two named exceptions (`crm_customer_actions.created_by → auth.users`,
`bank_movement_entity_links`'s polymorphic pair) — neither of those two
appears in any embed anywhere in `src/` (`bank_movement_entity_links`'s own
repository selects only its own flat columns, no embed; nothing in the
codebase embeds `auth.users` at all). So there is no gap: every embed found
follows a relationship phase 2 actually closed, and none depends on either
named exception.

The count differs from D16's original 14 because the codebase moved since
that count was taken (see "Why not 14" below), not because discovery missed
something D16 caught — the two files most affected (`cash-closings`,
`crm`) are exactly the modules that migrated to the hexagonal pattern in the
time since.

Of the 17 call sites, **13 are live** (reachable from a mounted route) and
**4 are dead code** — `src/services/cashClosingService.ts`'s four embeds are
unreachable: `cashClosingRoutes.ts` (its only importer) is never imported by
`src/server.ts`, which wires the cash-closings module's hexagonal router
instead. Confirmed by grep: nothing in `src/` imports `cashClosingRoutes`,
and `src/server.ts` has no reference to either file.

**Verdict: all 17 call sites are safe.** Every relationship they follow has
a validated composite FK from one of the 4 phase-2 migrations, and D8's
stale-row reasoning (production has had exactly one organization for its
entire history, so `VALIDATE CONSTRAINT` could not have found — and no row
written since could hold — a dangling cross-organization reference) applies
uniformly; nothing here needs a code change. See "Stale-row risk" note below
for the one caveat on how that claim was checked.

## Table

| # | File:Line | Relationship | Phase coverage (constraint) | Named-exception dependency | Verdict |
|---|---|---|---|---|---|
| 1 | `src/modules/bank-statements/adapters/out/supabase-occurrence-match-read.adapter.ts:61` | `recurring_occurrences.recurrence_id` → `recurring_contracts.id` | `recurring_occurrences_org_id_recurrence_id_fkey` (phase2d, validated) | No | Safe |
| 2 | same file, `:91` | same relationship | same constraint | No | Safe |
| 3 | `src/modules/crm/adapters/out/supabase-crm-workspace.repository.ts:26` | `crm_customer_actions.action_type_code` → `crm_action_types.code` | `crm_customer_actions_org_id_action_type_code_fkey` (phase2b, validated) | No | Safe |
| 4 | same file, `:73` | same relationship | same constraint | No | Safe |
| 5 | same file, `:80` | same relationship | same constraint | No | Safe |
| 6 | same file, `:91` (via the `select` local, declared `:88`) | same relationship | same constraint | No | Safe |
| 7 | same file, `:92` (same `select` local) | same relationship | same constraint | No | Safe |
| 8 | `src/modules/cash-closings/adapters/out/supabase-cash-closing.repository.ts:91` | `cash_closings.employee_id` → `hr_employees.id` | `cash_closings_org_id_employee_id_fkey` (phase2c, validated) | No | Safe |
| 9 | same file, `:107` | same relationship | same constraint | No | Safe |
| 10 | `src/services/cashClosingService.ts:238` (dead code — see above) | `cash_closings.employee_id` → `hr_employees.id` | `cash_closings_org_id_employee_id_fkey` (phase2c, validated) | No | Safe (unreachable; also covered if ever revived) |
| 11 | same file, `:251` | same | same | No | Safe (dead code) |
| 12 | same file, `:272` | same | same | No | Safe (dead code) |
| 13 | same file, `:326` | same | same | No | Safe (dead code) |
| 14 | `src/services/ingredientConsumptionService.ts:129` | `stock_items.category_id` → `stock_categories.id` | `stock_items_org_id_category_id_fkey` (phase2b, validated) | No | Safe |
| 15 | same file, `:222` | same relationship | same constraint | No | Safe |
| 16 | same file, `:285` | same relationship | same constraint | No | Safe |
| 17 | `src/services/stockMovementService.ts:244` (via `MOVEMENT_HISTORY_SELECT`, declared `:188-206`) | **two** nested relationships in one call: `stock_movements.item_id` → `stock_items.id`, and (nested inside that) `stock_items.category_id` → `stock_categories.id` | `stock_movements_org_id_item_id_fkey` (phase2b, validated) **and** `stock_items_org_id_category_id_fkey` (phase2b, validated) — both required for this row to be safe | No (neither leg) | Safe |

All 17 rows share the same stale-row statement, given once rather than
repeated per row: **no row written before `VALIDATE CONSTRAINT` ran could
hold a dangling cross-organization reference, because production has had
exactly one organization (`Angrybox`) for its entire history** — the same
reasoning D8 of the org-location-foundation spec used, restated by this
spec's own D8. This review did not independently re-derive that fact (no
production DB access from this task); it is carried forward from the spec's
own stated premise, which this task was not asked to re-verify.

## Why not 14

The original 14 was never written down as an itemized list (confirmed: no
match for "embedded select" anywhere under `.scratch/_done/scoped-access/`,
`docs/adr/`, or `docs/` besides D16's one summary sentence), so there's no
literal list to reconcile against — only an honest account of what's here
now and why it plausibly moved:

- **`cash_closings` doubled, one side went dead.** At B2's time this was
  presumably one legacy call path (`cashClosingService.ts`, which still has
  4 embed call sites today). Since then the cash-closings module migrated to
  the hexagonal pattern (`src/modules/cash-closings/`, README status
  "ativo"), which re-implements the same `*, hr_employees(full_name)` embed
  in its own repository (2 call sites) while the legacy file it replaced was
  left in the tree, unwired, rather than deleted — so the same relationship
  now shows up in both a live and a dead copy.
- **`crm_customer_actions` → `crm_action_types` shows up 5 times**, not
  because of duplication but because `supabase-crm-workspace.repository.ts`
  legitimately calls the same embedded shape from 5 different methods
  (dataset load, create, complete, and twice via a shared `select` local in
  `listCustomerActions`'s pending/history pair). A count of "distinct call
  sites" and a count of "distinct relationships worth reviewing" diverge
  here; this write-up counts call sites in the table above but the reviewed
  unit is really the 5 relationships in the "Headline result" section.
- **The `stock_movements`/`stock_items`/`stock_categories` two-level nest**
  (row 17) is one call site carrying two relationships — depending on
  whether D16's original 14 counted call sites or relationships, this alone
  could account for a 1-off either direction.

None of this changes the outcome — every relationship found resolves to a
validated composite FK from phase 2, and D8 doesn't require hitting exactly
14 (spec.md, D8: "the review's job is narrower than re-auditing from
scratch"). This section documents the discrepancy rather than forcing the
number to match.

## Flagged items

**None.** No embed found depends on either of D6's two named exceptions,
and no embed's relationship is missing composite-FK coverage. The 4
dead-code call sites in `cashClosingService.ts` are noted above for
completeness (and as a cleanup candidate for whoever next touches that
module) but are not a safety flag — they're unreachable, and the
relationship they'd exercise if ever reconnected is covered by the same
constraint as their live counterpart.

## Note on the stale-row / leftover-local-data check

This task ran without database credentials or a reachable local Supabase
instance with query access (no `psql`, no service-role key in this
environment), so "no leftover non-Angrybox rows exist in
`cash_closings`/`stock_items`/`stock_movements`/`crm_customer_actions`/
`recurring_occurrences` locally" was **not independently verified by direct
query** — it is carried forward from the spec's own premise (production has
had exactly one organization; ticket 21's two-organization smoke ran only
against the local stack, which is expected to be reset between work, not
against production). If whoever runs D9's own two-organization smoke for
this spec finds leftover `Segunda Organização` rows in any of these five
tables on their local stack, that's new information this review did not
have and should be reconciled against this document's "no stale-row risk"
claim before relying on it.

**Follow-up (orchestrator, direct query against the local stack):** ran
`select count(*) from <table> where org_id <> '<Angrybox org id>'` against
`cash_closings`, `stock_items`, `stock_movements`, `crm_customer_actions`,
`recurring_occurrences`, and `recurring_contracts` via
`docker exec supabase_db_vendus-dashboard-backend psql`. All six returned
`0`. No leftover cross-organization rows exist in any table an embed here
touches, closing this caveat.
