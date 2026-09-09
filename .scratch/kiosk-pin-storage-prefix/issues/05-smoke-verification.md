# 05 — Smoke verification: `invoice-documents` storage.objects RLS policies

Written smoke, not a Jest suite, per spec.md Section B Testing Decisions
("Policy verification ... matching B1's and B2's own precedent for claims
that only mean something against the real stack"). Run against the local
Supabase stack only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
API `http://127.0.0.1:54321`), matching ticket 04's own precedent
(`04-smoke-verification.md`) for this same spec.

## 1. Setup

- `npx supabase db reset` applied every migration cleanly, including the new
  `20260909140000_invoice_documents_storage_rls.sql` — confirmed via
  `pg_policies` (4 rows on `storage.objects`, all named
  `invoice-documents: org-scoped *`: select/insert/update/delete — see
  Deviation 1 for why select is present despite the ticket's literal
  "write/delete policies" wording) and `pg_proc` (`current_org` still
  resolves; it is reused from ticket 04's migration, not redefined here).
- Local `auth.users`/`organizations`/`org_members` came up empty besides the
  seeded Angrybox organization — same starting point ticket 04's smoke and
  the `composite-fk-indexes` smoke both hit.
- Provisioned two throwaway organizations directly via the service-role
  client (a Node script, `@supabase/supabase-js`, run from the repo root so
  `node_modules` resolves): an `organizations` row, an `auth.users` admin via
  the Auth admin API (`email_confirm: true`), and an `org_members` row
  (`role: admin`) linking them — mirroring
  `organizationProvisioningService.ts` step for step, same shortcut ticket
  04's smoke used (no `locations` row: the token hook only reads
  `org_members`).
  - Org A: `Smoke Org A (05)`, admin `admin-a-05@smoke.test`.
  - Org B: `Smoke Org B (05)`, admin `admin-b-05@smoke.test`.
- Both admins signed in for real via GoTrue's password grant. Decoded org
  A's `access_token`: carries `org_id` = org A's id, `org_role: admin` —
  confirming the existing token hook is what `current_org()` reads from,
  unchanged (org B's claim was not re-checked individually; ticket 04's
  smoke already established this for the identical mechanism).
- The local `invoice-documents` bucket did not exist yet (not
  migration-managed, same finding as `hr-documents` in ticket 04) — created
  as **public** (`public: true`) via the service-role Storage admin API,
  matching the bucket's real, intentional configuration (spec.md Section B
  Problem Statement).
- One object per org, uploaded via the **service role** (mirroring
  `objectStorage.upload`'s real prefixed shape, `{org_id}/{timestamp}_{safeName}`):
  - Org A: `<org-a-id>/1700000000000_invoice-a.pdf`
  - Org B: `<org-b-id>/1700000000000_invoice-b.pdf`

## 2. Results — org A's non-privileged (`authenticated`) session

| # | Operation | Expected | Result |
|---|---|---|---|
| 1 | List own prefix | Succeeds, sees the object | **PASS** — `error: null`, `names: ["1700000000000_invoice-a.pdf"]` |
| 2 | List org B's prefix | Blocked — RLS filters the row out, empty list | **PASS** — `error: null`, `names: []` |
| 3 | Download org B's object via the authenticated SDK (`.download()`) | **Succeeds** — the bucket is public, and this is confirmed to bypass RLS entirely for reads, not only the direct public-URL route (see Deviation 2) | **PASS** — `error: null`, data present |
| 4 | Fetch org B's object via its direct public URL (`getPublicUrl`), unauthenticated | Succeeds — the documented, unfixable limitation this ticket names explicitly | **PASS** — HTTP 200, body matches |
| 5 | Upload into own prefix | Succeeds | **PASS** — `error: null` |
| 6 | Upload into org B's prefix (path-guessing attempt) | Rejected by the insert policy | **PASS** — `StorageApiError`, `"new row violates row-level security policy"` |
| 7 | Overwrite (`update`, `upsert: true`) own object | Succeeds | **PASS** — `error: null` |
| 8 | Overwrite org B's object by path | Rejected by the update policy | **PASS** — `StorageApiError`, status 400, `"new row violates row-level security policy"` |
| 9 | Service-role re-check: org B's object content after row 8 | Unchanged — row 8's attempt never landed | **PASS** — body still `pdf-content-org-b` |
| 10 | Delete (`remove`) org B's object | Blocked — reports success/no-op, doesn't actually delete (see Deviation 1 / ticket 04's Deviation 3) | **PASS** — `error: null`, `data: []` |
| 11 | Service-role re-check: org B's object still exists after row 10 | Present — row 10's "success" was a no-op | **PASS** — data present |
| 12 | Delete own object | **Succeeds for real** — this is the case ticket 04's smoke never separately isolated, and where Deviation 1's fix mattered | **PASS** — `error: null` |
| 13 | Service-role re-check: own object after row 12 | Actually gone | **PASS** — download errors, no data |

## 3. Results — `objectStorage`'s own service-role path (unchanged for both orgs)

| Operation | Result |
|---|---|
| Service-role download, org B's object (after all the above) | **PASS** — succeeds throughout, unaffected by the new policies (service role bypasses RLS entirely, ADR-0007) |

15/15 checks passed overall (including the org_id-claim sanity check).

## 4. Deviations and notes

**Deviation 1 — the ticket's literal "write/delete policies only" wording does not work; an org-scoped SELECT policy had to be added too, for DELETE (and UPDATE's row-visibility) to function at all.** The ticket and spec.md Section B point 4 describe only insert/update/delete policies for this bucket, reasoning that a public bucket's own select behavior makes an RLS select policy pointless. That reasoning is correct about *read exposure* (Deviation 2 confirms it) but misses a separate, general Postgres RLS mechanic: **a DELETE-only policy with no accompanying SELECT-granting policy for the same role deletes zero rows, unconditionally — not just for a cross-org path, but for a legitimately matching, same-org path too.** Verified two ways before touching the real migration:

- An isolated probe table (`public.rls_delete_probe`, RLS enabled, one `for delete using (org = 'a')` policy, no select policy, granted `select/insert/update/delete` to `authenticated`): `select count(*)` returned 0, and `delete from ... where org = 'a'` returned `DELETE 0` even though the row existed and matched the policy predicate.
- Adding a matching `for select using (org = 'a')` policy to the same probe table made `delete ... where org = 'a'` correctly return `DELETE 1`, and `delete ... where org = 'b'` correctly stayed `DELETE 0` (filtered, not an error) — isolating that SELECT-level visibility, not the DELETE policy's own predicate, was the missing ingredient.
- Reproduced directly against `storage.objects` itself (as role `authenticated`, `request.jwt.claims` set to org A's claim, `storage.allow_delete_query` set to bypass this local stack's own `protect_delete` trigger): a raw `DELETE ... WHERE bucket_id = 'invoice-documents' AND name = '<org A's own path>'` returned `DELETE 0` before the select policy was added, matching the probe table's finding exactly.

Without this fix, the delete policy in this migration would have shipped **inert** — org A could never actually delete even its own object, while silently reporting success (`error: null`) — a worse outcome than no policy at all, because it reads as "protected and working" while doing nothing. The fix (`create policy "invoice-documents: org-scoped select" ... for select ... using (bucket_id = 'invoice-documents' and (storage.foldername(name))[1] = current_org()::text)`) adds no new read exposure (Deviation 2: the bucket already serves any object to anyone regardless of RLS) and brings this bucket's policy shape to exactly four policies, matching `hr-documents` (ticket 04) rather than diverging from it. The migration file documents this inline; flagged here explicitly per this ticket's instruction to record deviations, and because it changes what the ticket asked for (adds a select policy it explicitly didn't ask for) for a correctness reason, not a style preference.

**Deviation 2 — the public bucket bypasses RLS for reads even through the authenticated SDK's `.download()`, not only the direct public URL.** Row 3 confirms this: org A's authenticated, org-scoped session can `.download()` org B's object successfully — the same as an anonymous `fetch()` of the public URL (row 4). This is a stronger version of the limitation ADR-0015/DB3 already names ("a public bucket's read exposure is unchanged"): it isn't only that a previously-issued URL keeps working forever, it's that *no* read path for this bucket is gated by these policies at all, authenticated or not. The write/delete policies added here are exclusively about mutation (insert/update/delete) and about the one SELECT-driven side-effect that mutation needs internally (Deviation 1) — never about read confidentiality, which this bucket structurally cannot offer while it stays public (DB3, out of scope).

**Deviation 3 — a blocked `remove` reports success, not an error (same as ticket 04's Deviation 3).** Row 10: RLS silently filtering a `delete`'s target row out (rather than raising) means "the call didn't error" is not proof anything happened — row 11's independent service-role read is what actually proves the object survived. Identical shape to `hr-documents`' finding; not new here, repeated because this bucket's smoke needed its own confirmation.

**Deviation 4 — `invoice-documents` bucket is not created by any migration.** Same finding `hr-documents` (ticket 04) and `composite-fk-indexes` both recorded — created once by hand (Studio or the admin API) per environment, as public. Left in place afterward as boot-time infrastructure, matching that precedent.

## 5. Cleanup

Both organizations, their admins, and every object created for this smoke
(org A's original upload, org A's own-prefix second upload, org B's original
upload, org B's guessed-path attempt) were removed via the service role at
the end of the run. Confirmed after cleanup: `organizations` back to exactly
1 row (Angrybox), `auth.users` and `org_members` back to 0 rows, no stray
script left in the repository (the throwaway Node script used to drive this
smoke was deleted after the run, not committed).

## 6. Summary for the orchestrator

The `invoice-documents` `storage.objects` policies (select/insert/update/
delete, keyed on `(storage.foldername(name))[1] = current_org()::text`)
enforce org isolation correctly for every mutating operation against a real
non-privileged `authenticated` session: org A cannot write, overwrite, or
actually delete org B's prefixed objects by guessing or enumerating a path,
while its own prefix works normally end to end (list, own upload, own
overwrite, own delete all succeed for real, not just apparently).
`objectStorage`'s service-role path — the app's actual, everyday path — is
confirmed unaffected for both organizations. `current_org()` (reused
unchanged from ticket 04's migration) is confirmed callable from this
bucket's policy context too.

The one deviation from the ticket's literal wording — adding a select policy
the ticket didn't ask for — was necessary for the delete/update policies to
be anything more than decorative (Deviation 1); it changes no read-exposure
guarantee, since this bucket's actual reads (via `.download()` or the public
URL) bypass RLS entirely regardless of any select policy (Deviation 2). The
core limitation the ticket asked to have documented explicitly — that these
policies protect administrative operations only, and do nothing for a URL
(or, per Deviation 2, an authenticated download call) against an object
someone can already address — is confirmed exactly as expected, and is
recorded in `docs/adr/0015-storage-object-rls-leading-path-segment-no-backfill.md`
and `src/modules/invoices/README.md`.
