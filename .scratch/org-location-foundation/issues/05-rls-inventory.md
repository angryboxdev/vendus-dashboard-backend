# RLS inventory — issue 05

Written alongside `05-rls-audit-and-hr-holes.md`. Settles the "audit findings
(already gathered)" section of that issue: they turned out to be stale, for a
reason worth stating plainly (see below), and this file replaces them as the
source of truth. Also the write-up that feeds open decision 3
(`docs/MULTI_TENANCY_SAAS_DESIGN.md` §6, item 3).

## Headline: the pre-gathered findings were stale

The issue's "already gathered" section says 21 of ~52 tables have RLS enabled,
16 of those decoratively, only 5 genuinely deny-all, and ~31 tables — including
`invoices`, `payable_entries`, `bank_movements`, `bank_accounts`, `suppliers`,
`cash_closings`, `crm_customers` — completely unprotected.

Checked against the live schema today (via the baseline in
`20260822141653_remote_schema.sql`, produced by issue 01's `db pull`, and
confirmed against the running local stack after `supabase db reset`), that is
no longer true:

- **55 of 57 tables have RLS enabled** (57 = the baseline's tables +
  `organizations` + `locations` from issue 03).
- Of those 55, **only 15 carry any policy** — all "allow ... for anon". The
  other **40 are already genuinely deny-all**, not 5.
- **Only 2 tables have no RLS at all**: `hr_public_holidays` and
  `supplier_article_mappings`.

None of the tables named in the stale findings as "unprotected" are — `invoices`,
`payable_entries`, `bank_movements`, `bank_accounts`, `suppliers`,
`cash_closings` and `crm_customers` all have RLS enabled with zero policies.

**Why the numbers moved:** the original count was almost certainly taken by
grepping `supabase/migrations/_archive/` for `enable row level security` — that
finds ~17 files covering ~20 tables, which lines up with the stale "21 of 52".
But per issue 01 / D1 / ADR-0006, this repo's migration history is not a
reliable record: `supabase/README.md` documented pasting DDL straight into the
dashboard SQL Editor, and issue 01's baseline is the first artifact that reads
the *actual* Postgres catalog instead of the file trail. Most of the RLS
enablement on this list was evidently done that way — through the SQL Editor,
never captured in a migration — which is exactly the drift issue 01 exists to
stop happening again. This audit is downstream of that baseline, so it is the
first version of this finding that can be trusted.

One correction also inherited from issue 06's own reconciliation note: the live
schema has 55 tables besides `organizations`/`locations`, not the 52
`spec.md`'s "Table inventory" lists — `cost_centers`, `crm_action_types`,
`crm_customer_actions` and `payable_entries` are missing from that list, and
`dre_receita_bruta` (listed) doesn't exist (only in `_archive/`, never
applied). The table below covers the true 57.

## Full inventory (57 tables)

Columns: **RLS** = row level security enabled. **Policies** = count of
`for anon`-style policies (all existing policies in this schema are anon
policies; none are org-keyed — that's spec B). **Client** = which Supabase
client actually reads/writes it today, from a full grep of every `.from(` call
site plus each hexagonal module's composition root wiring
(`service` = `getSupabaseServiceRole()`, `anon` = `getSupabase()`, `none` = no
call site found in `src/`).

| Table | RLS | Policies | Client |
|---|---|---|---|
| analytics_monthly_cache | yes | 0 | service |
| app_users | yes | 0 | service |
| bank_accounts | yes | 0 | service |
| bank_movement_entity_links | yes | 0 | service |
| bank_movement_match_hints | yes | 0 | service |
| bank_movements | yes | 0 | service |
| bank_reconciliation_rules | yes | 0 | service |
| bank_statement_imports | yes | 0 | service |
| banks | yes | 0 | service |
| cash_closings | yes | 0 | service |
| channels | yes | 1 (decorative — see below) | service |
| classification_rules | yes | 0 | service |
| cost_center_categories | yes | 0 | service |
| cost_center_groups | yes | 0 | service |
| cost_centers | yes | 0 | none — no call site in `src/`; looks superseded by `cost_center_categories`/`cost_center_groups` |
| crm_action_types | yes | 0 | none — no call site in `src/` |
| crm_contacts | yes | 0 | service |
| crm_customer_actions | yes | 0 | none — no call site in `src/` |
| crm_customer_tags | yes | 0 | service |
| crm_customers | yes | 0 | service |
| crm_orders | yes | 0 | service |
| crm_parameters | yes | 0 | service |
| crm_scripts | yes | 0 | service |
| crm_tags | yes | 0 | none — no call site in `src/` |
| dre_custos_fixos | yes | 4 | **anon** |
| dre_custos_variaveis | yes | 4 | **anon** |
| **hr_audit_logs** | **fixed by this issue** | 0 | service |
| hr_employee_documents | yes (already, undocumented — see below) | 0 | service |
| hr_employee_payments | yes | 0 | service |
| hr_employees | yes | 0 | service |
| **hr_leave_balances** | **fixed by this issue** | 0 | service |
| **hr_leave_requests** | **fixed by this issue** | 0 | service |
| hr_public_holidays | **no — left alone, deliberately** | 0 | service |
| hr_shift_attendance | yes | 0 | service |
| hr_work_shifts | yes | 0 | service |
| invoice_lines | yes | 0 | service |
| invoices | yes | 0 | service |
| locations | yes | 0 | none yet — created by issue 03, no reader wired up until later (spec A/C) |
| organizations | yes | 0 | service |
| payable_entries | yes | 0 | service |
| pizza_prices | yes | 4 | **anon** |
| pizza_recipe_items | yes | 4 | **anon** |
| pizza_recipes | yes | 4 | **anon** |
| pizzas | yes | 4 | **anon** |
| preparation_items | yes | 4 | **anon** |
| preparations | yes | 4 | **anon** |
| recurring_contracts | yes | 0 | service |
| recurring_occurrences | yes | 0 | service |
| stock_categories | yes | 4 | **anon** |
| stock_items | yes | 4 | **anon** |
| stock_movements | yes | 4 | **anon** |
| supplier_article_mappings | **no — out of scope for this issue** | 0 | **anon** |
| supplier_import_hints | yes | 0 | service |
| supplier_invoice_import_lines | yes | 1 | **anon** |
| supplier_invoice_imports | yes | 1 | **anon** |
| suppliers | yes | 0 | service |
| vendus_product_mapping | yes | 4 | **anon** |

## What this issue changes

`hr_audit_logs`, `hr_leave_requests`, `hr_leave_balances` get RLS enabled with
zero policies, in
`supabase/migrations/20260822160000_hr_rls_deny_by_default.sql`, matching what
028/032 already do for the rest of HR (`hr_employees`, `hr_work_shifts`,
`hr_employee_payments`, `hr_shift_attendance`).

**`hr_employee_documents`** — the fourth hole named in the issue — needed no
migration: the live schema already has RLS enabled on it with zero policies.
Nothing in `supabase/migrations/_archive/` (specifically `042`, which created
the table) ever turned it on, so this is one more instance of the same
undocumented dashboard-SQL-Editor drift described above — just one that
happened to land on the safe side. Flagged here rather than silently skipped,
because "already fixed, untracked" is exactly the kind of state issue 01 was
built to stop hiding.

**`hr_public_holidays`** is left without RLS, per the issue and `spec.md`: it
is read by leave calculations, holds no sensitive data, and is not part of the
"four HR holes."

**`supplier_article_mappings`** also has no RLS and is read by the anon client
(`vendusMappingService.ts` / `supplierInvoiceImportService.ts` area), making it
the one genuinely open, anon-reachable table left in the schema. It is not an
HR table and not named in this issue's scope ("close the four HR holes"), so it
is not touched here — noted for whoever picks up spec B's policy work, since
closing it needs the same zero-cost deny-by-default treatment and does not
need to wait for `org_id`.

**`channels`**' anon policy is decorative today: `financial-base` reads the
table exclusively through the service role
(`supabase-channel.repository.ts`). Not touched here — cleaning up unused anon
policies on already-service-role-only tables is spec-B-adjacent hygiene, not a
security hole, and out of this issue's scope.

## Verified against the local stack

- `supabase db reset` replays cleanly through this migration (alongside issues
  03 and 06's, already in `supabase/migrations/`).
- `pg_class.relrowsecurity` confirms all four HR tables now `t`, with zero rows
  in `pg_policies` for any of them; `hr_public_holidays` and
  `supplier_article_mappings` confirmed still `f`.
- Direct REST calls: the anon key gets an empty result set from
  `hr_leave_requests` and `hr_audit_logs` post-change (deny-by-default working);
  the service role key reads and writes both normally.
- Ran the real service-layer code (`hrLeaveService.getLeaveRequests`,
  `hrAuditService.logAudit` + `listAuditLogs`) against the local stack with
  `SUPABASE_URL` pointed at `127.0.0.1:54321` — reads and a real insert both
  succeeded unmodified. This is the concrete version of "service role bypasses
  RLS" the issue's done-criteria rely on.
- Full test suite (`npm test`): 137 suites / 1169 tests, unchanged — as D11
  notes, this suite cannot detect anything a schema-only change like this one
  breaks, so it is confirmation of "nothing else moved," not evidence of
  correctness here.
- `tsc --noEmit`: clean. No source code changed for this issue, only a
  migration file.

## Feeds open decision 3

`docs/MULTI_TENANCY_SAAS_DESIGN.md` §6, item 3: does RLS become the real
tenant boundary, or does app-level scoping carry it with RLS as backstop only?

The corrected numbers sharpen the answer already implied in the issue: **there
is even less real policy surface to preserve than assumed.** 40 of 57 tables
are already deny-all with zero policies — mechanically ready for org-keyed
policies once `org_id` exists, nothing to unwind. Real anon-reachable surface
is down to 14 tables (the legacy `src/services/*` call sites: `pizza_*`,
`preparation_*`, `stock_*`, `dre_custos_fixos`, `dre_custos_variaveis`,
`supplier_invoice_import*`, `vendus_product_mapping`) plus the one open door,
`supplier_article_mappings` — all reached by the same ~15 legacy files, none of
them HR, none of them CRM (CRM moved to service role at some point after the
original audit was written; all 6 CRM services are service-role-only today).
Every other table, including every financial and CRM table, is read
exclusively through the service role — confirmed by grepping every
`getSupabaseServiceRole`/`getSupabase()` call site and every hexagonal module's
composition root, not by re-asserting the issue's prior claim.

So the decision is, as the issue says, purely about the service-role call
sites — and there are more of them carrying real tenant-scoping weight (every
financial/CRM/HR table) than there is anon surface to eventually retire. That
weighs toward "RLS as backstop, app-level scoping as the real boundary": the
place where isolation actually has to be enforced is the ~42 service-role
tables where RLS structurally cannot help (service role bypasses it by
design), not the 14-15 anon-policy tables where RLS already does the job.
Left as input to that decision, not as the decision itself — §5.1 assigns that
to spec B.
