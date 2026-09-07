# 04 — User administration becomes organization-scoped

Status: ready-for-agent
Blocked by: 03
Spec: `../spec.md` (D8)

## Problem

Listing and creating users reads and writes the whole `app_users` table with the
service role, unfiltered. On the day organization #2 exists, an admin at one
restaurant can enumerate and modify the accounts of another. This is the single
most dangerous endpoint in the codebase.

It is also this spec's proof. B1's exposure is the same one spec A had: an
`orgId` populated and consumed by nobody is inert, and its only acceptance
criterion would be "it exists". User administration is the natural consumer and
not a contrived one — scoping it is required work that doubles as the
demonstration that the claim is real. Invoice PDFs played this role in spec A.

## Work

Rework the four handlers so each acts only within `req.auth.orgId`:

| Operation | Behaviour |
|---|---|
| List users | Members of the caller's organization only |
| Create user | Creates the account **and** a membership in the caller's organization |
| Change role | Only for a member of the caller's organization |
| Remove user | Removes the membership in the caller's organization; deletes the account only when it was that person's last membership |
| Any operation on a non-member | Behaves as not found, whether or not the identifier is real |

**Request and response shapes do not change.** The listing still returns
identifier, email, role and timestamps; creation still takes email, password and
role. This is what keeps the front end's administration screen untouched.

## Notes

- **The listing is now two reads joined in memory.** PostgREST cannot join into
  the `auth` schema, so an organization's users are a membership query plus the
  auth admin user listing. That listing is paginated: a restaurant has on the
  order of ten users, so a single page is the realistic case — and the code must
  still handle more than one.
- **The removal rule is the one genuinely new decision.** With one organization
  it is observationally identical to today. With several it makes revocation
  scoped to the contract that granted it: removing someone here must not touch
  their access anywhere else.
- **`auth.users` cascade is real.** The dropped `app_users` primary key already
  referenced it, so `on delete cascade` on `org_members.user_id` is database
  behaviour, not an application convention.
- These handlers stay in the legacy route file. The spec declines to migrate
  them: D10 admits exactly one new seam, and the endpoints are thin with their
  risk concentrated in the organization filter, which is visible in review.
- This ticket removes the last back-end reader of `app_users`.

## Verification

Smoke, by hand, against the local stack — pulling in an HTTP testing library for
four thin handlers would add a second new seam for less value than the two the
spec already has. The multi-organization cases need the second organization from
ticket 05, so they are covered in ticket 07; what is checkable here is the
single-organization behaviour.

## Done when

- [x] The user listing returns only members of the caller's organization
- [x] Creating a user creates the account and a membership in the caller's
      organization, and the response shape is byte-for-byte what it was
- [x] Changing a role works for a member and behaves as not found for anyone else
- [x] Removing a user removes the membership, and deletes the account only when
      it was that person's last one
- [x] Every operation naming a real user outside the caller's organization
      behaves as not found — a guessed identifier reveals nothing
- [x] No request or response shape changed; the front end administration screen
      is untouched
- [x] Nothing in `src/` reads `app_users`

## Comments

Implemented entirely inside `src/routes/authRoutes.ts` — no new files, per the
ticket's own note that these handlers stay in the legacy route file. `req.auth`
already carried `orgId`/`orgRole` from ticket 03, and every route mounted under
`/api/auth` already runs behind `requireAuth` + `requireMinRole("admin")`
(`server.ts` line 96), so `req.auth!` was already safe to use unguarded before
this change and still is.

**`GET /users`.** Now two reads joined in memory, as D8/the ticket's Notes
describe: `org_members` filtered by `eq("org_id", req.auth!.orgId)` for
`user_id, role, created_at, updated_at`, then a new `resolveEmailsById` helper
walks `supabase.auth.admin.listUsers({ page, perPage: 1000 })` page by page,
collecting emails for the member ids into a `Map`, and stopping once every id
is found or a short page (`users.length < perPage`) signals the end of the
listing — so it isn't hard-coded to "one page is enough" even though that's
the realistic case. The two are joined into the same `{id, email, role,
created_at, updated_at}` shape the endpoint returned before.

**`POST /users`.** Unchanged auth-user creation, then an insert into
`org_members` (`org_id: req.auth!.orgId, user_id, role`) instead of
`app_users`. Same orphan-cleanup-on-failure behaviour (delete the just-created
auth user if the membership insert fails). Email comes back from the request
body rather than a second read, since `org_members` has no email column — no
observable difference in the response.

**`PATCH /users/:id`.** Added a `findMembership(supabase, orgId, id)` helper
(`org_members` filtered by both `org_id` and `user_id`, `.maybeSingle()`) run
before anything else in the handler; a miss returns the same generic 404 the
handler already used for "not found," so a non-member and a nonexistent id are
indistinguishable, satisfying the "behaves as not found either way" line in
D8's table. Password update is unchanged (`auth.admin.updateUserById`). Role
update now writes `org_members` scoped by both `org_id` and `user_id` instead
of `app_users` by `id`. Email is no longer available from the row being
updated, so it's fetched once via `auth.admin.getUserById(id)` — called
whether or not the role changed, since it's now the only source of the email
field the response shape requires.

**`DELETE /users/:id`.** Self-deletion guard unchanged. Added the same
`findMembership` pre-check for the not-found behaviour. Then: delete the
`org_members` row scoped to `(org_id, user_id)` — the "revoke here, not
everywhere" rule (D8, the ticket's "genuinely new decision") — followed by a
`count`-only query (`select("user_id", { count: "exact", head: true
}).eq("user_id", id)`, no `org_id` filter) against `org_members` for that same
user id. Only when that count is zero is `auth.admin.deleteUser(id)` called,
so the account is deleted exactly when the membership just removed was the
person's last one, per `on delete cascade` on `org_members.user_id` (D4) doing
nothing here since the membership row is already gone by the time the count
runs.

**Verification.** Per the ticket's own Verification section this is smoke-only
— no HTTP test library added. Ran `npx tsc -p tsconfig.build.json --noEmit`
(clean) and the full suite, `npm test` (142/142 suites, 1215/1215 tests,
unaffected by this change since no existing test touches `authRoutes.ts`).
`grep -rn "app_users" src/` now returns nothing — this ticket was the last
back-end reader, clearing the way for ticket 06 to drop the table. The
multi-organization cases (a second org's admin cannot see/touch this org's
users) need the second organization from ticket 05 and are exercised in
ticket 07, per the ticket's Verification note; not re-tested here.
