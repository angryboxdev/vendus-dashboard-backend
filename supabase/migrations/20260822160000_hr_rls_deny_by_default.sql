-- Close the HR RLS holes found by the audit in
-- .scratch/org-location-foundation/issues/05-rls-audit-and-hr-holes.md.
--
-- Migrations 034 (hr_audit_logs) and 036 (hr_leave_requests,
-- hr_leave_balances, hr_public_holidays) created these tables without ever
-- enabling row level security, unlike 028/032 which turned it on -- with no
-- policies -- for the rest of the HR module (hr_employees, hr_work_shifts,
-- hr_employee_payments, hr_shift_attendance).
--
-- Deny-by-default needs no org_id, so this closes three of the four holes
-- now, ahead of spec B's org-keyed policies:
--
--   * hr_audit_logs
--   * hr_leave_requests
--   * hr_leave_balances
--
-- hr_employee_documents (migration 042, the fourth hole named in the issue)
-- is not touched here: cross-checking the live schema against the archived
-- migrations shows RLS was already enabled on it, undocumented -- almost
-- certainly a hand-applied change via the dashboard SQL Editor, the exact
-- practice ADR-0006 retires. Re-running `enable row level security` on it
-- would be a harmless no-op, but there is nothing to fix.
--
-- hr_public_holidays is left alone deliberately (see spec.md): it is read by
-- leave calculations and holds no sensitive data.
--
-- This is a no-op for the application: all HR services read and write
-- through the service role client (src/infra/supabaseClient.ts ::
-- getSupabaseServiceRole), which bypasses RLS entirely. No frontend or
-- anon-key caller ever touches these tables.

alter table "public"."hr_audit_logs"
  enable row level security;

alter table "public"."hr_leave_requests"
  enable row level security;

alter table "public"."hr_leave_balances"
  enable row level security;
