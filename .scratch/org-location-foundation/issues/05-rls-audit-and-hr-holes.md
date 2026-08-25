# 05 — RLS audit, and close the four HR holes

Status: open
Blocked by: 01
Spec: `../spec.md` (Scope, D11)

## Problem

§5.1 splits phase 2: the audit half runs in spec A and settles open decision 3;
the policy half waits for spec B, because org-keyed policies need `org_id`.
Deny-by-default, however, needs no `org_id` at all.

## Audit findings (already gathered — confirm and write up)

- **21 of ~52 tables have RLS enabled.** The other ~31 have none, so the anon key
  reads and writes them unguarded: `invoices`, `payable_entries`,
  `bank_movements`, `bank_accounts`, `suppliers`, `cash_closings`,
  `crm_customers`.
- **16 of those 21 carry `"Allow … for anon"` policies** — enabled but wide open.
- **Only 5 are genuinely deny-all:** `app_users`, `hr_employees`,
  `hr_employee_payments`, `hr_shift_attendance`, `hr_work_shifts`.
- **The HR privacy lock has holes the design doc does not mention.** Migrations
  `034` (`hr_audit_logs`), `036` (`hr_leave_requests`, `hr_leave_balances`,
  `hr_public_holidays`) and `042` (`hr_employee_documents`) never enabled RLS.
  Employee document metadata, leave records and the audit log sit in the
  unprotected ~31.
- **All 31 anon-client call sites are in `src/services/*`** — stock, pizzas, DRE,
  supplier invoices, Vendus mapping. **Every one of the 8 HR services uses the
  service role exclusively**, zero anon calls.

## Work

1. Write the inventory as a table — table → RLS enabled? → policies → which
   client reads it — covering all 52 tables. Commit it alongside this issue.
2. Enable RLS with no policies on `hr_employee_documents`,
   `hr_leave_requests`, `hr_leave_balances` and `hr_audit_logs`, matching what
   `028`/`032` already do for the rest of HR.

Step 2 is provably a no-op for the application: all 8 HR services use the
service role, which bypasses RLS, and the frontend calls this API only — it does
not query Supabase directly.

`hr_public_holidays` is left alone: it is read by leave calculations and is not
sensitive.

## Feeds open decision 3

There is almost **no real policy surface to preserve** — 5 deny-all tables, 16
decorative, 31 absent. So the question "does RLS become the real boundary, or
does app-level scoping carry it" is not constrained by existing policies at all.
It is purely a question about the 76 service-role call sites. Record this in the
audit output; §5.1 says the audit is what settles the decision.

## Done when

- [x] The inventory covers all 52 tables and is committed
      (covers the true 57 — see the note in `05-rls-inventory.md` on why
      `spec.md`'s "52" undercounts against the live schema, same discrepancy
      issue 06 independently found)
- [x] RLS is enabled with zero policies on the four HR tables
      (`hr_leave_requests`, `hr_leave_balances`, `hr_audit_logs` via
      `supabase/migrations/20260822160000_hr_rls_deny_by_default.sql`;
      `hr_employee_documents` was already enabled, undocumented, before this
      issue — see inventory)
- [x] Every HR endpoint still works against the local stack (it should — service role bypasses RLS)
      (verified at the service-layer: `hrLeaveService`/`hrAuditService` read
      and write normally against the local stack after the migration; anon key
      gets denied, service role key doesn't)
- [x] The open-decision-3 finding is written into the audit output

## Comments

The "Audit findings (already gathered)" section above turned out to be stale —
confirmed and superseded by `05-rls-inventory.md`, which is the actual
deliverable this issue's Work item 1 asks for. Short version: the live schema
(readable for the first time via issue 01's baseline, not the migration file
trail) shows 55 of 57 tables already have RLS enabled with zero policies —
including `invoices`, `payable_entries`, `bank_movements`, `bank_accounts`,
`suppliers`, `cash_closings`, `crm_customers`, all named above as
"unprotected." They aren't. See the inventory file for the full table and the
open-decision-3 write-up. Verified locally via `supabase db reset`, direct
`pg_class`/`pg_policies` checks, REST calls with both keys, and running the
real HR service code against the local stack. Full test suite (137/137,
1169 tests) and `tsc --noEmit` both clean — neither can detect a change like
this one (D11), so both are "nothing else moved," not correctness evidence.
