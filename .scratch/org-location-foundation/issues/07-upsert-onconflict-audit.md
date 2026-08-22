# 07 — Upsert / `onConflict` audit and fixes

Status: open
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

## Done when

- [ ] The audit table is committed, covering every `.upsert(` site
- [ ] Each site is either verified unchanged or fixed
- [ ] Every upsert path has been run against the local stack, not reasoned about
