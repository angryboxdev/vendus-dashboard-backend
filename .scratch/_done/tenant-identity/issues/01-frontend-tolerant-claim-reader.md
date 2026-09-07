# 01 — Front end: tolerant claim reader, org-scoped role type, organization on the session user

Status: done
Blocked by: —
Spec: `../spec.md` (D9)
Repo: **front end** — `/Users/viniciusbazanella/projects/vendus-dashboard-frontend`
(note: `CLAUDE.md` records a stale path for this repo)

## Problem

The front end builds its session by reading the role claim straight out of the
JWT, not by asking the API. The token hook is a database migration, so the claim
shape changes the instant that migration runs — independently of any application
deploy. Ship the migration first and every user appears logged out.

This ticket is D9's step 1, and it is the only step whose ordering is
load-bearing. It ships before ticket 02 and is harmless in the meantime, because
a reader that accepts either shape is correct while the old shape is still what
arrives.

## Work

1. `parseRole` accepts **either** claim shape: the new `org_role`, falling back
   to the old `app_role`. Both carry the same three values.
2. The session user gains an organization identifier, read from the new `org_id`
   claim. It is `null` while the old-shape token is what arrives.
3. Rename the role type to say it is org-scoped. The three values are unchanged
   (spec D6) — only the name and what it means change.
4. Leave the administration screen and the navigation role check alone. D8 keeps
   every API request and response shape identical, so nothing else has to move.

## Notes

- The fallback to `app_role` is temporary by construction. Its removal is D9's
  step 4, a later release, and is deliberately not in this spec.
- Follow the front end's own `CLAUDE.md` and its reference module. `AuthContext`
  is the only file reading the claim today; `UsersPage` consumes the role type.
- No back-end change belongs in this ticket. The contract between the repos is
  unchanged here — the token is not part of the HTTP contract, which is exactly
  why this ordering problem exists.

## Done when

- [x] A token carrying `org_role` resolves a session with that role
- [x] A token carrying only the old `app_role` still resolves a session with
      that role — verified against the current back end, before ticket 02 runs
- [x] The session user exposes an organization identifier, populated from the
      `org_id` claim and `null` when the claim is absent
- [x] The role type name reflects org scoping; its three values are unchanged
- [x] The administration screen and navigation role check are untouched
