# 04 — Smoke verification: `hr-documents` storage.objects RLS policies

Written smoke, not a Jest suite, per spec.md Section B Testing Decisions
("Policy verification ... matching B1's and B2's own precedent for claims
that only mean something against the real stack"). Run against the local
Supabase stack only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
API `http://127.0.0.1:54321`), matching every prior smoke in this family.

## 1. Setup

- `npx supabase db reset` applied every migration cleanly, including the new
  `20260909130000_hr_documents_storage_rls.sql` — confirmed via
  `pg_policies` (4 rows: select/insert/update/delete on `storage.objects`,
  all named `hr-documents: org-scoped *`) and `pg_proc` (`current_org`
  exists). `storage.objects.relrowsecurity` is `t` (RLS already enabled by
  Supabase's own baseline; the migration only adds policies — see Deviation
  1).
- Local `auth.users`/`organizations`/`org_members` came up empty besides the
  seeded Angrybox organization — same "prior session's state, not a fresh
  reset carrying fixtures" starting point the `composite-fk-indexes` smoke
  (`.scratch/_done/composite-fk-indexes/07-two-org-smoke.md`) hit.
- Provisioned two throwaway organizations directly via the service-role
  client (a Node script, `@supabase/supabase-js`, run from the repo root so
  `node_modules` resolves): `organizations` row, an `auth.users` admin via
  the Auth admin API (`email_confirm: true`), and an `org_members` row
  (`role: admin`) linking them — mirroring
  `organizationProvisioningService.ts` step for step, same as the FK smoke's
  own workaround.
  - Org A: `Smoke Org A (04)`, admin `admin-a-04@smoke.test`.
  - Org B: `Smoke Org B (04)`, admin `admin-b-04@smoke.test`.
- Both admins signed in for real via GoTrue's password grant. Decoded each
  `access_token`: org A's carries `org_id` = org A's id, `org_role: admin`;
  org B's carries `org_id` = org B's id, `org_role: admin` — confirming the
  existing token hook
  (`supabase/migrations/20260825120000_org_members_and_token_hook.sql`)
  is what `current_org()` reads from, unchanged.
- The local `hr-documents` bucket did not exist yet (not migration-managed —
  same as the FK smoke's own finding) — created as **private**
  (`public: false`) via the service-role Storage admin API.
- One object per org, uploaded via the **service role** (mirroring
  `objectStorage.upload`'s real prefixed shape,
  `{org_id}/{employeeId}/{id}/{safeName}`):
  - Org A: `<org-a-id>/employee-a/doc-a/contract.pdf`
  - Org B: `<org-b-id>/employee-b/doc-b/contract.pdf`

## 2. Results — org A's non-privileged (`authenticated`) session

| # | Operation | Expected | Result |
|---|---|---|---|
| 1 | List own prefix (`<org-a-id>/employee-a/doc-a`) | Succeeds, sees the object | **PASS** — `error: null`, `names: ["contract.pdf"]` |
| 2 | List org B's prefix (`<org-b-id>/employee-b/doc-b`) | Blocked — RLS filters the row out of the underlying query, so this returns an empty list, not a thrown error | **PASS** — `error: null`, `names: []`, length `0` |
| 3 | Download own object | Succeeds | **PASS** — `error: null`, data present |
| 4 | Download org B's object | Blocked | **PASS** — `error: {"message":"{}","name":"StorageUnknownError"}`, `data: null` — select-policy denial surfaces as an opaque error on `download` (which layers a signed-URL fetch on top of `list`), rather than the flat empty-array shape `list` gives; both are "cannot read," confirmed together with row 2 |
| 5 | Upload into org B's prefix (`<org-b-id>/employee-a-attempt/doc-x/hack.pdf`) | Rejected by the insert policy | **PASS** — `StorageApiError`, status `400`, message `"new row violates row-level security policy"` — the one case where Postgres's own policy-violation error surfaces verbatim through the Storage API |
| 6 | Upload into org A's own prefix | Succeeds (sanity check that the insert policy isn't accidentally deny-all) | **PASS** — `error: null` |
| 7 | Remove (`delete`) org B's object | Blocked | **PASS-ish, see note** — `error: null`, `data: []`. Storage's `remove` reports success with zero affected rows when RLS filters the target row out of the `delete`, rather than raising an error — row 8 is what actually proves the object survived |
| 8 | Service-role download of org B's object, taken right after row 7 | Still present — row 7's delete never actually touched it | **PASS** — `error: null`, data present, confirming row 7's "success" was a no-op, not a real deletion |

## 3. Results — `objectStorage`'s own service-role path (unchanged for both orgs)

| Operation | Result |
|---|---|
| Service-role download, org A's object | **PASS** — succeeds, unaffected by the new policies (service role bypasses RLS entirely, ADR-0007) |
| Service-role download, org B's object | **PASS** — same |

## 4. Deviations and notes

**Deviation 1 — `alter table storage.objects enable row level security` cannot run as `postgres` locally.** The migration's first draft included that statement (mirroring `20260822160000_hr_rls_deny_by_default.sql`'s pattern for ordinary tables). Applying it failed: `ERROR: must be owner of table objects (SQLSTATE 42501)` — `storage.objects` is owned by `supabase_storage_admin` in Supabase's own baseline, not `postgres`, and RLS is already enabled on it out of the box. Removed the `alter table` statement from the migration; only the four `create policy` statements remain, and `db reset` applies cleanly. Confirmed via `pg_class.relrowsecurity = 't'` before and after — this migration doesn't need to flip it.

**Deviation 2 — `download`'s cross-org error is opaque, `list`'s is a clean empty result.** Both are genuine RLS enforcement (rows 2 and 4), but a future reader comparing this smoke's output to the FK-constraint smoke's clean named-constraint errors should not expect the same clarity from Storage's `download`: the client-side SDK wraps the underlying request in a way that surfaces `{"message":"{}","name":"StorageUnknownError"}` rather than a descriptive 403. `list` and `upload` (rows 2, 5) give unambiguous evidence instead.

**Deviation 3 — a blocked `remove` reports success, not an error.** Row 7 matters for anyone writing a future non-privileged Storage consumer: RLS silently filtering a `delete`'s target row (rather than raising) means "the call didn't error" is not proof of anything. Row 8 (an independent service-role read) is the actual proof the delete-policy predicate held.

**Deviation 4 — `hr-documents` bucket is not created by any migration.** Same finding the `composite-fk-indexes` smoke recorded — created once by hand (Studio or the admin API) per environment. Left in place in this local stack afterward as boot-time infrastructure, matching that precedent's treatment of the bucket.

## 5. Cleanup

Unlike `composite-fk-indexes`' smoke (which deliberately kept its second
organization as reusable scaffolding, per that ticket's own instructions),
this smoke's two organizations/admins were single-purpose synthetic
fixtures named for this run (`Smoke Org A (04)` / `Smoke Org B (04)`) with
no instruction to keep them — all removed:

- The three storage objects created for this smoke (org A's original
  upload, org A's second own-prefix upload, org B's original upload) —
  deleted via the service role.
- `org_members` rows for both smoke orgs — deleted.
- Both `auth.users` admins — deleted via the Auth admin API.
- Both `organizations` rows — deleted.

Confirmed after cleanup: `organizations` back to exactly 1 row (Angrybox),
`auth.users` and `org_members` back to 0 rows, `git status` shows only the
two intended new files (the migration and the extended
`hrDocumentService.test.ts`) — no stray script left in the repository.

## 6. Summary for the orchestrator

The `hr-documents` `storage.objects` policies (select/insert/update/delete,
keyed on `(storage.foldername(name))[1] = current_org()::text`) enforce
org isolation correctly against a real non-privileged `authenticated`
session carrying the existing `org_id` JWT claim: org A cannot list, read,
write, or delete org B's prefixed objects, while its own prefix works
normally. `objectStorage`'s service-role path — the app's actual,
everyday path — is confirmed unaffected for both organizations, matching
ADR-0007's "the service role bypasses policies entirely" description
exactly. `current_org()` is confirmed callable from a Storage policy
context (the risk named in spec.md's Risks table), reusing the token hook
unchanged — no new claim or hook was needed.
