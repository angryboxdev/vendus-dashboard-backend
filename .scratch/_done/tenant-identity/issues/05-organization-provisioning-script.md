# 05 — Organization provisioning script

Status: ready-for-agent
Blocked by: 02
Spec: `../spec.md` (D7)

## Problem

There is no way to create an organization, and deliberately there will be no
endpoint for it. An endpoint that creates organizations must be authorized by
something, and that something becomes a permanent privileged concept in the
running application. Worse, such a request is legitimately *unscoped* — so B2's
scoped query helper would need an escape hatch and the raw-query lint would need
an exception. §2.6 already observes that escape hatches get reused. Keeping
provisioning outside the request path lets the rule governing 371 call sites
stay absolute, because the exception is not in the same building.

There is also a practical reason this ticket exists now rather than later: a
second organization on the local stack is the **only** way to exercise any
multi-organization path at all. Production has one.

## Work

A script, run from `package.json` like the other operational jobs, that in one
run creates:

1. the `organizations` row (`name`, `nif`, optional `address` and `email` — `nif`
   is unique and is the organization boundary per §2.3),
2. its first `locations` row,
3. the first auth user, and
4. that user's **admin** membership in the new organization.

A new customer must be usable the moment it finishes.

## Not in scope

**Seed template data.** The channel list §3.2 calls an org template, cost centre
groups and categories, stock categories, public holidays — none of it. The
script creates the organization, its location and its first admin, and stops.
Angrybox is already seeded; the need appears with the first real new customer,
and it is in the deferred register with that trigger.

## Notes

- **The operator has no bypass.** Access to a customer's organization is an
  ordinary membership row like anyone else's — visible, revocable, and present
  in whatever audit trail exists. There is no platform-administrator concept
  anywhere in the codebase, and this script must not create one. What this does
  not buy is any protection against a leaked service role key, which grants
  everything either way; the gain is architectural and is claimed as no more
  than that.
- **Exactly one membership per user.** D5 locks a two-organization person out of
  both, so the script must never be the thing that produces one.
- **Make the gate visible.** No second `organizations` row may exist in
  production until the deferred register's first four items land — device
  identity for the user-less paths, the org-claim RLS policies and storage path
  prefixing, the composite keys and indexes, and seed template data. This script
  is the natural place for that gate to be stated where someone will read it
  before running it, rather than remembered.

## Done when

- [x] One command creates an organization, its first location, its first auth
      user and that user's admin membership
- [x] The created admin can sign in against the local stack and their token
      carries the new organization and the `admin` role (see Comments — sign-in
      and the hook's claim computation are both verified; the one piece NOT
      verified end-to-end is GoTrue actually invoking the hook locally, because
      of a pre-existing local-stack config gap unrelated to this ticket's Work)
- [x] Exactly one membership row is created per run
- [x] The script refuses a duplicate `nif` rather than producing a second
      organization for the same legal entity
- [x] The organization #2 gate and its four blocking items are stated where the
      operator running the script will see them
- [x] No seed template data is created

## Comments

Implemented as:

- `src/services/organizationProvisioningService.ts` — the orchestration
  (`provisionOrganization`), fully injectable (no Supabase import), plus
  `DuplicateOrganizationNifError`.
- `src/jobs/runOrganizationProvisioning.ts` — the CLI entry point: env-var
  parsing, the real Supabase-backed `ProvisionOrganizationDeps`, the
  organization-#2 gate banner (printed before and after the run), and
  `process.exit` codes.
- `src/services/__tests__/organizationProvisioningService.test.ts` — 9 unit
  tests against in-memory fakes (no I/O).
- `package.json` — added `org:provision` (`node dist/jobs/runOrganizationProvisioning.js`)
  and `org:provision:dev` (`tsx src/jobs/runOrganizationProvisioning.ts`),
  following the `<area>:<verb>[:dev]` convention of the existing `cron:*` /
  `stock:*` scripts. No other line in `package.json` was touched.

Env vars the job reads: `ORG_NAME`, `ORG_NIF` (required), `ORG_ADDRESS`,
`ORG_EMAIL` (optional), `LOCATION_NAME`, `LOCATION_CODE` (required),
`LOCATION_TIMEZONE` (optional, defaults to `Europe/Lisbon`), `ADMIN_EMAIL`,
`ADMIN_PASSWORD` (required). Missing required vars print a message naming the
var and exit 1 before any Supabase call is made.

**Orchestration order and rollback**, pinned by the unit tests: organization
→ location → auth user → membership. A failure at any step rolls back
everything created by the steps before it, in reverse order (delete auth user
→ delete location → delete organization, or the relevant suffix of that),
then rethrows the original error — mirroring the existing `POST /users`
create-then-cleanup pattern in `src/routes/authRoutes.ts`. Rollback is
best-effort: a rollback failure is reported via an `onRollbackError` hook
(defaults to `console.error`) but never swallows or replaces the original
error, so the operator always sees why the run actually failed.

**Exactly one membership per run.** `createMembership` is called from exactly
one call site in `provisionOrganization`, unconditionally once and only after
every prior step has succeeded — there is no loop, no retry, and no code path
that reaches it twice. Pinned directly by the test "never calls
createMembership more than once, even on the happy path", and indirectly by
every other test asserting the exact call sequence.

**Duplicate `nif`.** `createOrganization` is the first call in the
orchestration; the real adapter detects a unique-constraint violation
(`error.code === "23505"`, with a message-based fallback since supabase-js's
`PostgrestError.code` typing doesn't guarantee it's populated on every code
path) and throws `DuplicateOrganizationNifError` before anything else is
created, so there is nothing to roll back. Pinned by the "refuses a duplicate
nif... performs no rollback" unit test (asserts `calls` is exactly
`["createOrganization"]`) and confirmed against the real local stack (below).

**Organization #2 gate.** `GATE_BANNER` in `runOrganizationProvisioning.ts` is
printed to stdout both before and after the run (so it's visible whether the
run fails fast on env vars or succeeds), naming all four blocking items from
the ticket's Notes verbatim: device identity for user-less paths, org-claim
RLS policies + storage path prefixing, composite keys/indexes, seed template
data. It also states explicitly that the script does not check environment
and will not refuse to run — this is a documentation gate, not an enforced
one, per the ticket. The same framing is repeated in the file's top-of-file
comment block for anyone reading the source rather than running it.

**No operator bypass.** The only new row type this script's admin gets is an
ordinary `org_members` row with `role = 'admin'` — the same shape and same
table as any other membership created via `POST /api/auth/users`. Nothing in
`organizationProvisioningService.ts` or the job file introduces a flag,
claim, or table that distinguishes this membership from one created any other
way.

**No seed template data.** The script's four writes are organization,
location, auth user, membership, full stop — no channels, cost centre
groups/categories, stock categories, or public holidays are touched anywhere
in either new file.

### Verification against the local stack

Docker's local Supabase containers were already running
(`supabase_db_vendus-dashboard-backend` etc., started before this session).
`supabase_migrations.schema_migrations` showed only migrations through
`20260822160000` applied — ticket 02's migration
(`20260825120000_org_members_and_token_hook.sql`) was not yet applied to this
particular running instance, so `org_members` and the rewritten hook didn't
exist yet. Applied it directly (`docker exec -i ... psql ... <
supabase/migrations/20260825120000_org_members_and_token_hook.sql`, then
recorded the version in `supabase_migrations.schema_migrations` to keep the
tracking table honest) rather than running `supabase db reset --local`, to
avoid disturbing any state the parallel agent (working on ticket 03, the auth
middleware, in this same working tree) might depend on. `app_users` was empty
at that point, so the backfill inserted 0 rows — consistent with `org_members`
starting empty.

Ran the job against `http://127.0.0.1:54321` (the local stack's REST/auth
URL, from `npx supabase status`) with the service-role key from that same
output — **not** the `.env` file's `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`,
which point at a different, unrelated hosted project
(`oobplqewonmitnesvlsl.supabase.co`); `.env` was not read for credentials and
was not modified.

- **Happy path**: `ORG_NAME="Acme Restaurants" ORG_NIF=999888777 ... npx tsx
  src/jobs/runOrganizationProvisioning.ts` printed the gate banner, then a
  JSON result with `organization`, `location`, `admin_user`, `membership`,
  then the gate banner again, exit 0. Confirmed directly in Postgres:
  `organizations` gained exactly one new row (Acme, `nif=999888777`),
  `locations` gained exactly one new row pointing at that `org_id`,
  `org_members` gained exactly one row (`role=admin`, matching `org_id` and
  the new `auth.users` row's id), and `auth.users` gained exactly one row.
- **Duplicate nif**: re-ran with the same `ORG_NIF=999888777` (different org
  name, location, admin email) → printed the gate banner, then
  `An organization with nif "999888777" already exists.` to stderr, exit 1.
  Confirmed via `select id, name, nif from organizations` that there is still
  only one row for that nif — no second `organizations` row, and (per the
  orchestration order) no location/user/membership were even attempted.
- **Sign-in**: `POST /auth/v1/token?grant_type=password` with the created
  admin's email/password against the local stack succeeded and returned a
  valid session (decoded the JWT: `sub` matched the created user id). The
  claims did **not** include `org_id`/`org_role`, because
  `supabase/config.toml`'s `[auth.hook.custom_access_token]` block is
  commented out on this local stack — GoTrue was never told to invoke the
  hook at all, independent of anything this ticket's script does. This is a
  pre-existing local-dev wiring gap: it isn't part of ticket 02's Work items
  either (ticket 02 verified the hook function directly via `psql`, not via a
  live GoTrue token issuance, per its own Comments), and it's not something
  ticket 05 asks this script to fix. To still verify the property Done-when
  #2 actually cares about — that this script's membership row produces the
  right claims — I called `custom_access_token_hook` directly (same technique
  as ticket 02's Comments) with the new admin's `user_id`: it returned
  `{"org_id": "d070bef3-...-acme", "org_role": "admin"}` correctly. So the
  data this script writes is provably correct; only the GoTrue-level wiring
  to actually attach the hook is unverified locally, and that wiring is
  outside this ticket's scope. **Flagging this to the user**: consider a
  small follow-up (either folded into ticket 02 or its own local-dev-config
  ticket) to uncomment and fill in
  `[auth.hook.custom_access_token]` in `supabase/config.toml` so `npx
  supabase start` wires GoTrue to the hook locally — I did not make that
  change myself, since it touches shared local-stack config, isn't asked for
  by either ticket's Work section, and would require restarting the whole
  local stack (risking disruption to the parallel agent's session) to take
  effect.
- **Cleanup**: deleted the test `auth.users` row (cascades to `org_members`
  per the FK), then the test `locations` row, then the test `organizations`
  row, by hand via `psql` — mirroring ticket 02's "nothing persisted in the
  repo's seed data" discipline. Re-checked afterward: `organizations` back to
  just Angrybox, `locations` back to just Arcozelo, `org_members` and
  `auth.users` both back to empty (their state before this verification —
  `app_users` was empty on this instance, so there was no backfilled
  Angrybox membership to begin with).

`npm run build` is clean. The new test file
(`src/services/__tests__/organizationProvisioningService.test.ts`) passes:
9/9. Did not run the full `npm test` suite, per instructions.
