# 02 — `org_members`, and the token hook injects organization + org-scoped role

Status: ready-for-agent
Blocked by: 01 (must be **deployed** first — see Notes)
Spec: `../spec.md` (D4, D5, D9), ADR-0003

## Problem

A role is still a global property of a person: `app_users.role` says what
someone is everywhere, forever. There is no way to express "manager at Angrybox,
nothing at customer #2" — the ordinary case the moment a second organization
exists, and the reason ADR-0003 exists.

Nothing in the running application knows which organization a request belongs
to, and the token is where that has to start: an organization that arrives as a
signature-verified claim cannot be asserted by a client, and cannot be forgotten
by the newest endpoint.

## Work

1. **Create `org_members`** — the membership record replacing the global role:

   ```
   org_members
     org_id      uuid  not null  → organizations(id)
     user_id     uuid  not null  → auth.users(id) on delete cascade
     role        text  not null  check (role in ('admin','manager','hr_viewer'))
     created_at  timestamptz not null default now()
     updated_at  timestamptz not null default now()
     primary key (org_id, user_id)
   ```

   RLS enabled with zero policies, matching `organizations` and `locations`.

2. **Backfill** one membership per existing `app_users` row, into the Angrybox
   organization, carrying that row's role.

3. **Grant the hook read access.** The hook runs as `supabase_auth_admin` and
   needs an explicit `select` grant on the new table. Without it the hook fails
   silently by injecting nothing, which presents as *every user locked out* —
   the single most likely way this whole spec gets misdiagnosed.

4. **Rewrite `custom_access_token_hook`** to read `org_members` and inject two
   claims: `org_id` and `org_role`. The rule is **exactly one membership, or no
   claims at all** — zero and two are treated identically, and the system never
   answers a request against a guessed tenant.

5. **Keep `app_users`.** It is dropped in ticket 06, once nothing reads it.

## Notes

- **Why `app_users` stays.** This is the expand half of expand–contract, and it
  buys a real property rather than tidiness: between this ticket and ticket 03
  the back end still looks for `app_role`, does not find it, and falls back to
  its existing `app_users` lookup. Sessions keep working. Drop the table here
  and the window between the two tickets is a total lockout instead.
- **Ordering against ticket 01.** This migration changes the claim shape the
  instant it runs, so the tolerant reader must already be deployed. This is the
  one failure mode of this spec that users would notice.
- Claim names: `org_id` follows `docs/MULTI_TENANCY_SAAS_DESIGN.md` phase 4;
  `org_role` replaces `app_role` because a name asserting a global fact while
  holding an org-scoped one is worse than a rename (D9).
- Accepted cost of the rule in step 4: a person in two organizations is locked
  out of both. Hard to reach by accident, and the provisioning script (ticket
  05) creates exactly one membership.

## Verification

The hook is plpgsql and cannot be reached from the Jest suite. Exercise it
directly against the local stack by calling the function with a synthetic event
and asserting on the returned claims — the prior art is spec A's RLS work, whose
findings were written down as a deliverable rather than automated into CI.

Write the findings into this file under `## Comments`.

## Done when

- [x] `org_members` exists with the shape above, RLS enabled, zero policies
- [x] Every pre-existing `app_users` row has a matching Angrybox membership with
      the same role
- [x] A user with exactly one membership receives both `org_id` and `org_role`,
      the role being the one held in that organization
- [x] A user with no memberships receives neither claim
- [x] A user with two memberships receives neither claim — including the case of
      the same person holding *different* roles in two organizations, which is
      the reason the case exists
- [x] The `supabase_auth_admin` read grant is asserted explicitly, so a missing
      grant fails loudly here instead of presenting as a lockout later
      (see Comments: asserted and present, but empirically not load-bearing
      in this codebase — the function's `SECURITY DEFINER` ownership already
      covers it)
- [x] `app_users` still exists and the running back end still authenticates
      through its fallback lookup

## Comments

Implemented as `supabase/migrations/20260825120000_org_members_and_token_hook.sql`.
Verified against the local stack (`npx supabase db reset --local`, then direct
`psql`/`docker exec` against `supabase_db_vendus-dashboard-backend`) as follows.
All synthetic rows were inserted and deleted by hand; nothing below is
persisted in the repo's seed data.

**Schema.** `org_members` exists with the exact shape in the ticket (`\d
org_members`: `org_id`, `user_id`, `role` with the three-value check, `created_at`,
`updated_at`, PK on `(org_id, user_id)`, FKs to `organizations(id)` and
`auth.users(id) on delete cascade`). `relrowsecurity = t` and `pg_policies` has
zero rows for it, matching `organizations`/`locations`.

**Backfill.** Confirmed on the pre-reset state (one `app_users` row, role
`admin`): after the migration, `org_members` held exactly one row, same
`user_id`, `org_id` = Angrybox's fixed id, `role = 'admin'`.

**Grant.** `information_schema.role_table_grants` shows
`(supabase_auth_admin, SELECT)` on `org_members` after the migration runs.

**Hook, exercised as `supabase_auth_admin` (not `postgres`)** — connected over
TCP as that role (`GOTRUE_DB_DATABASE_URL` in the auth container gives the
local password) so the call matches how GoTrue actually invokes it, rather
than trusting the function's `SECURITY DEFINER` owner by proxy:

- One membership (`manager` in Angrybox) → `{"org_id": "<angrybox>", "org_role":
  "manager"}` injected alongside the existing claims.
- Zero memberships → claims unchanged, neither key present.
- Two memberships, deliberately with *different* roles in two organizations
  (`admin` in Angrybox, `hr_viewer` in a synthetic second org) → claims
  unchanged, neither key present. This is the case D5 calls out by name, and
  counting rows rather than trying to pick one is what makes it fall out for
  free — no special-casing needed in the function.

**One finding worth flagging.** I revoked the `supabase_auth_admin` grant and
re-ran the one-membership case expecting the failure mode the ticket describes
("fails silently by injecting nothing"). It didn't fail: the claims came back
identical to the with-grant case. Reason: `custom_access_token_hook` is
`security definer`, owned by `postgres`, which owns `org_members` outright —
table ownership carries implicit full privileges independent of any `GRANT`,
and a `SECURITY DEFINER` function's body runs under the owner's privileges
regardless of who calls it. So in this codebase, as currently structured, the
grant is not load-bearing for the hook to function. I kept it anyway — it's
what the ticket asks for, it matches the existing precedent on `app_users`
(already granted to `supabase_auth_admin` in the baseline), it's what Supabase's
own hook documentation directs, and it stops being a no-op the moment anyone
changes the function's owner or drops `security definer`. But the "fails
loudly" framing in the ticket and D5 doesn't hold in this environment: a
missing grant would *not* currently present as a lockout, because it can't
happen without the grant already existing to be missing from a differently-owned
function. Re-verified the grant is present via the catalog query above, which
is the check that actually matters here.

**Unaffected by this change.** `app_users` still exists (schema and grants
untouched) and `src/middleware/auth.ts` is untouched — it still reads the
`app_role` claim (not found on tokens minted after this migration) and falls
back to its `app_users` lookup, per the expand-half-of-expand–contract design.
Confirmed by reading the file, not by running the server against the new hook
end-to-end; that end-to-end check belongs to ticket 03, once the middleware
reads `org_role`/`org_id`.
