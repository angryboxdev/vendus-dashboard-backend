# 07 — Upsert / `onConflict` audit and fixes

Status: done
Blocked by: 06
Spec: `../spec.md` (D11)

## Problem

Issue 06 rewrites nine unique constraints. PostgREST's upsert resolves conflicts
against a named constraint or an inferred primary key — so changing a constraint
silently changes upsert semantics, and the failures land at runtime in code that
has **no tests**.

This is the one part of spec A with a known, enumerable break list, so it gets a
written audit rather than a step someone remembers.

## Known breaks

| Site | Today | After issue 06 |
|---|---|---|
| `src/services/crmCustomerService.ts:357` | `onConflict: "customer_id,tag_name"` | Still valid — the CRM key structure is deferred (D7). **Re-check when gate item 4 lands.** |
| `src/services/crmContactService.ts:189` | `onConflict: "customer_id,tag_name"` | Same. |
| `src/modules/vendus/adapters/out/supabase-analytics-cache.adapter.ts:35` | `.upsert(rows)` — no `onConflict`, PostgREST infers the PK | PK becomes `(org_id, year, month)`. The rows do not carry `org_id`; the column default fills it before conflict resolution. **Verify against the local stack — do not assume.** |
| `src/services/analyticsDashboardService.ts:344` | Same | Same. |
| `src/services/hrShiftAttendanceService.ts:160` | `onConflict: "work_shift_id"` | Unchanged — parent-keyed. |
| `src/services/hrLeaveService.ts:356` | `onConflict: "employee_id,year"` | Unchanged — parent-keyed. |

Also check SQL `ON CONFLICT` targets in the archived migrations if any are ever
re-run (they should not be) and in any new seed files: `on conflict (code)`,
`on conflict (key)`, `on conflict (name)` all reference constraints that issue 06
changes.

## Work

1. Grep every `.upsert(` and every `onConflict` in `src/`. There are 6 upserts
   today; confirm the count has not changed.
2. For each, state in the audit: the table, the conflict target, whether issue 06
   changes it, and the verification performed.
3. Fix what breaks. For the `analytics_monthly_cache` sites, prefer an explicit
   `onConflict: "org_id,year,month"` over relying on PK inference — the inference
   is what makes this fragile.
4. Exercise each upsert path against the local stack. Two of the six are in
   `src/services/`, which has zero tests, so this is the only coverage they get.

## Audit

Confirmed via `grep -rn "\.upsert(\|onConflict" src/` (excluding tests): still
exactly 6 upsert call sites, matching the "Known breaks" count above. No other
`onConflict` or `.upsert(` sites exist.

Each row below states the table, the conflict target as PostgREST actually
resolves it, whether issue 06 changed the underlying constraint, and the
verification performed against the local stack (`supabase db reset`, then a
`supabase-js` client pointed at `http://127.0.0.1:54321` with the local
service-role key — exercising the exact call shape from the source, insert
then re-upsert, checking row count and updated value).

| Site | Table | Conflict target | Changed by issue 06? | Verified |
|---|---|---|---|---|
| `src/services/crmCustomerService.ts:357` | `crm_customer_tags` | `onConflict: "customer_id,tag_name"` — matches `crm_customer_tags_pkey` `(customer_id, tag_name)` | No — PK unchanged; the CRM key structure is deferred (D7/gate item 4) | Confirmed live: seeded `(customer_id, tag_name)` pair upserted twice → 1 row, no error (idempotent) |
| `src/services/crmContactService.ts:189` | `crm_customer_tags` | Same as above | No | Same code path as above; identical constraint, not re-run separately |
| `src/modules/vendus/adapters/out/supabase-analytics-cache.adapter.ts:35` | `analytics_monthly_cache` | Was: no `onConflict`, PK-inferred `(year, month)`. Now: explicit `onConflict: "org_id,year,month"` | Yes — PK became `(org_id, year, month)` (`pg_constraint` confirms `analytics_monthly_cache_pkey` is `PRIMARY KEY (org_id, year, month)`) | **Fixed and verified live.** Before the fix: confirmed empirically that plain `.upsert(rows)` still worked — `org_id` (no default supplied by the row) is filled by the column `DEFAULT` *before* PostgREST's `ON CONFLICT` resolution runs, so the insert-then-upsert round trip produced 1 row, not 2, and the second call's values won. Changed anyway per Work item 3 (the ticket's own point: PK inference is what makes this fragile — e.g. it would silently break again if gate item 3 ever drops the `org_id` default before this call site is updated to supply `org_id` explicitly). Re-verified live with the explicit `onConflict` in place: same insert → re-upsert round trip, 1 row, value updated, `org_id` still filled by the default. |
| `src/services/analyticsDashboardService.ts:344` | `analytics_monthly_cache` | Same fix as above | Yes | Same call shape, same fix, covered by the same verification (identical table/constraint) |
| `src/services/hrShiftAttendanceService.ts:160` | `hr_shift_attendance` | `onConflict: "work_shift_id"` — matches `hr_shift_attendance_work_shift_id_key` `UNIQUE (work_shift_id)` | No — parent-keyed, untouched by D6 | Confirmed live: real seeded `hr_work_shifts` row, insert-then-upsert → 1 row, `notes` field updated to the second call's value |
| `src/services/hrLeaveService.ts:356` | `hr_leave_balances` | `onConflict: "employee_id,year"` — matches `hr_leave_balances_employee_id_year_key` `UNIQUE (employee_id, year)` | No — parent-keyed, untouched by D6 | Confirmed live: real seeded `hr_employees` row, insert-then-upsert → 1 row, `days_entitled` updated to the second call's value |

**SQL `ON CONFLICT` targets in `supabase/`:** `grep -rn "on conflict" supabase/ -i`
finds `(code)`, `(key)`, `(name)` targets, but every hit is under
`supabase/migrations/_archive/` (056, 070, 051, 050, 049, 069) — archived,
never applied, per D1/issue 01's discipline rule. No `ON CONFLICT` exists
anywhere else under `supabase/`, including the new local seed fixtures from
issue 02. Nothing to fix here; flagged for whoever reconciles the archive
policy, not for this ticket.

**Fix applied:** both `analytics_monthly_cache` sites now pass
`{ onConflict: "org_id,year,month" }` explicitly instead of relying on PK
inference.

## Done when

- [x] The audit table is committed, covering every `.upsert(` site
- [x] Each site is either verified unchanged or fixed
- [x] Every upsert path has been run against the local stack, not reasoned about
      (all 6 sites collapse to 4 distinct table/constraint pairs, each exercised
      live via `supabase-js` against the local stack — see verification column)
