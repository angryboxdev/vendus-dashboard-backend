# 07 — Two-organization smoke test

**What to build:** A written, checked-into-the-repo smoke test against the
local stack proving the fan-out and isolation decisions actually hold, the
same way spec B2's two-organization smoke test and spec E's pairing/
revocation smoke test prove theirs.

Rescoped from the consumption cron (ticket 05, won't-do — that cron is
disabled) to the direct-debits cron (ticket 06), which has no missing-
credentials skip case, only per-organization failure isolation.

Seed a second local-only organization alongside Angrybox. Run
`process-direct-debits`'s fan-out (ticket 06) and verify:

- Both organizations are processed.
- A forced failure injected for Angrybox's processing does not prevent the
  second organization's processing from completing, and vice versa —
  i.e. the fan-out utility's per-item isolation holds end to end, not just in
  its own unit tests.

**Blocked by:** 06

**Status:** done and verified

- [x] A written smoke test exists, runnable against the local Supabase
      stack, following this repo's existing smoke-test format (see spec B2's
      and spec E's).
- [x] It seeds a second organization alongside Angrybox.
- [x] It asserts both organizations are processed by
      `process-direct-debits`'s fan-out.
- [x] It asserts a forced failure in one organization's processing doesn't
      prevent the other's run from completing.
- [x] The test is documented as reproducible by a future reader (matching
      the bar set by B2's and E's smoke tests).

## Comments

### Where B2's and E's smoke tests actually live

Neither spec B2 (`.scratch/scoped-access/issues/21-drop-defaults-composite-keys-and-smoke.md`)
nor spec E (`.scratch/location-credentials/issues/06-closing-mandatory-token-and-adrs.md`)
has a separate smoke-test document — the write-up lives inline, in the
ticket's own `## Comments` section, narrating the actual run against the
local stack. This ticket follows that same convention: this section **is**
the smoke test, not a pointer to one.

### Why this cron has no natural per-organization failure to inject

Unlike spec B2's cross-org-location rejection (a real foreign-key
violation) or the till-closing/kiosk device-token checks, `invoices`'
schema gives no legitimate way to leave a per-organization row in a state
that fails later: every foreign key `invoices` carries
(`supplier_id`, `cost_center_group_id`, `cost_center_category_id`) is
`ON DELETE SET NULL`, so deleting the referenced row never leaves a
dangling reference to trip on update, and inserting a bad reference to begin
with is rejected at insert time, not later. `Invoice.markPaid()` only
throws for `status === "cancelled"`, and
`findPendingDirectDebits` already excludes `cancelled` rows from the query
that feeds the loop — so that branch is unreachable from real data. No
CHECK constraint restricts `invoices.status` or `payable_entries.status` to
a fixed set either, so a garbage value doesn't help.

Given that, the failure was injected the way the ticket allows explicitly
("a flag, bad credential, mock, or **code comment marker**"): a temporary,
clearly-labelled one-line marker in
`ProcessDirectDebitsUseCase.execute()` —

```ts
if (invoice.notes === "FORCE_SMOKE_FAILURE") {
  throw new Error(`forced failure for smoke test (invoice ${invoice.id})`);
}
```

— added before the run, keyed off the invoice's own `notes` field (so no
organization id needs to be hardcoded), and removed immediately after
(`git diff` on the use-case file is empty after cleanup — verified). This
throws from inside the exact same `try` the real `fanOut` wraps every item
in, so it exercises the actual isolation path, not a fake standing in for
it.

### The smoke test, run for real against the local stack

The local stack (Postgres/GoTrue/PostgREST/Kong on the standard
`127.0.0.1:5432x` ports, already running via Docker) started with only
Angrybox/Arcozelo present and zero `auth.users` rows — the same baseline as
B2's and E's runs.

**Provisioning the second organization.** The interactive
`org:provision:dev` script expects a TTY for its password prompt and
doesn't play well with piped stdin, so — matching spec E's ticket 06, which
hit the same problem and hand-rolled it — provisioning was done directly
against the local stack instead of through the script:
- `organizations`/`locations` rows inserted directly: **Segunda
  Organização** (`9a9f39b6-0dfb-4183-9731-d7e855bc3cb8`) / **Sede Segunda**
  (`549118eb-fea8-4c37-b0bf-19471215e361`) — the same ids B2's and E's runs
  used, for continuity with those write-ups.
- One GoTrue admin user per organization (`POST /auth/v1/admin/users`,
  service-role key): `admin@angrybox.test` / `admin@segundaorg.test`.
- One `org_members` row per admin, `role = 'admin'`.
- Both signed in via `POST /auth/v1/token?grant_type=password` — both
  access tokens decoded with the correct `org_id`/`org_role` claims
  (Angrybox → `b6999cff-...`; Segunda → `9a9f39b6-...`), confirming
  `custom_access_token_hook` is wired on this stack.

**A pre-existing local-boot blocker, unrelated to this ticket, hit and
worked around.** `src/server.ts` now resolves Vendus and AirMenu
credentials from the database at boot (tickets 03/04 of this same spec) and
throws if Angrybox's rows aren't seeded — the bare local stack has none.
Worked around by running the two documented one-time cutover scripts
against the local stack before starting the server:
`npx tsx src/jobs/runVendusCredentialsCutover.ts` and
`npx tsx src/jobs/runAirMenuCredentialsCutover.ts` (both read the existing
`.env` Vendus/AirMenu values and upsert them into
`vendus_credentials`/`vendus_location_config`/`air_menu_credentials`/
`air_menu_location_config` for Angrybox; no external network call, safe to
re-run). This is a one-time local-stack setup step, not part of this
ticket's changes, and is left in place afterward (see Cleanup) since any
future local work needs it too.

**App server** run with `SUPABASE_URL=http://127.0.0.1:54321`,
`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` set to the local stack's
standard demo keys, and `CRON_SECRET=smoke-test-secret`, all exported in the
shell ahead of `npx tsx src/server.ts` — `.env`'s own `SUPABASE_URL`
(remote) was never touched.

**Both organizations are processed, with none pending.** Before seeding any
invoices: `POST /api/internal/cron/process-direct-debits` (`Authorization:
Bearer smoke-test-secret`) →
`{"succeeded":[{"item":{"organizationId":"b6999cff-...","name":"Angrybox"},"status":"success"},{"item":{"organizationId":"9a9f39b6-...","name":"Segunda Organização"},"status":"success"}],"skipped":[],"failed":[]}`
— both organizations returned by `listOrganizations()` appear in the
summary, `fanOut` found nothing pending for either, both bucketed
`succeeded`.

**Seeding one pending direct-debit invoice per organization**, via the real
authenticated endpoint (`POST /api/invoices`, each org's own admin bearer
token), `directDebitDate` in the past (`2026-09-01`, run on `2026-09-07`):
- Angrybox: `SMOKE-DD-AB-001`, `notes: "FORCE_SMOKE_FAILURE"` — the marker
  above will make this one throw.
- Segunda Organização: `SMOKE-DD-S2-001`, no marker — expected to process
  normally.
Both created `201` with `status: "pending"`.

**Running the fan-out with the marker in place — the isolation holds end to
end.** `POST /api/internal/cron/process-direct-debits` returned:
```json
{
  "succeeded": [{"item": {"organizationId": "9a9f39b6-...", "name": "Segunda Organização"}, "status": "success"}],
  "skipped": [],
  "failed": [{"item": {"organizationId": "b6999cff-...", "name": "Angrybox"}, "status": "failed",
              "reason": "forced failure for smoke test (invoice 71e7213e-ab2d-4082-abe3-676053d0c869)"}]
}
```
Both organizations were visited in the same run (Angrybox's failure is
*in* the response, not a missing entry) and the response came back `200` —
one organization's exception never escaped to fail the request. Server
logs confirm the interleaving `fanOut` itself is expected to produce:
```
[fan-out] succeeded 9a9f39b6-0dfb-4183-9731-d7e855bc3cb8
[fan-out] failed b6999cff-79b2-4583-b8b4-a744b3ace748: forced failure for smoke test (invoice 71e7213e-...)
```
one `console.log` line and one `console.error` line, one per organization,
both present — matching ticket 06's "a per-organization log line records
success or failure" checkbox, now proven live rather than only in the fake-backed
route test.

**Database state confirms the isolation, not just the HTTP response.**
`select org_id, invoice_number, status, paid_at from invoices where
invoice_number like 'SMOKE-DD-%'` after the run:

| org_id (org) | invoice_number | status | paid_at |
|---|---|---|---|
| Angrybox | SMOKE-DD-AB-001 | `pending` | *(null)* |
| Segunda Organização | SMOKE-DD-S2-001 | `paid` | 2026-09-01 |

Angrybox's forced failure left its invoice exactly as it was — `markPaid`
was never reached for it, since the marker throws before that line — while
Segunda's invoice was independently marked paid in the same run. Neither
invoice had a `dueDate` set, so neither had an auto-created `payable_entries`
row to check via `markPaidByInvoiceId` (that write is a no-op for zero
matching rows, consistent with B2's finding that this repo's update/delete
calls report success on zero rows rather than erroring) — not a gap in this
smoke, since the assertion under test is the `invoices` row transition,
which `markPaid`/`invoiceRepo.update` alone already prove.

**Cleanup.** `DELETE /api/invoices/:id` for both smoke invoices (`204`
each, via each org's own token). `org_members`, the `locations` row, and
the `organizations` row for Segunda Organização deleted directly; both
GoTrue admin users deleted via `DELETE /auth/v1/admin/users/:id` (`200`
each). Re-checked: `organizations`/`locations` back to exactly the one
Angrybox/Arcozelo row each, `auth.users` back to zero, zero rows matching
`SMOKE-%`. The temporary marker in
`process-direct-debits.use-case.ts` was reverted — `git diff` on that file
is empty. The Vendus/AirMenu credentials-cutover rows for Angrybox
(required just to boot the server locally post tickets 03/04) were left in
place, per the note above.

### Full test suite

`npx jest --config jest.config.cjs src/modules/invoices/__tests__/use-cases/process-direct-debits.test.ts src/routes/__tests__/internalCronRoutes.test.ts`
— 13/13 passing, run after the marker was reverted.
