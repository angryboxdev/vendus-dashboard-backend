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

- [ ] The user listing returns only members of the caller's organization
- [ ] Creating a user creates the account and a membership in the caller's
      organization, and the response shape is byte-for-byte what it was
- [ ] Changing a role works for a member and behaves as not found for anyone else
- [ ] Removing a user removes the membership, and deletes the account only when
      it was that person's last one
- [ ] Every operation naming a real user outside the caller's organization
      behaves as not found — a guessed identifier reveals nothing
- [ ] No request or response shape changed; the front end administration screen
      is untouched
- [ ] Nothing in `src/` reads `app_users`
