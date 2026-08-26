# 06 — Drop `app_users`

Status: ready-for-agent
Blocked by: 04, 05
Spec: `../spec.md` (D4)

## Problem

`app_users` mirrored `auth.users` and carried the global `role`. With roles
org-scoped it holds nothing `auth.users` does not, and a table left behind with
a stale role column is a second answer to "what may this person do" — the exact
ambiguity ADR-0003 exists to remove.

This is the contract half of expand–contract. It was kept alive through tickets
02–05 so that no window existed in which the back end had neither the old
mechanism nor the new one.

## Work

1. Confirm nothing reads it: the token hook stopped at ticket 02, the middleware
   fallback at ticket 03, user administration at ticket 04, and the provisioning
   script (ticket 05) never did.
2. Drop the table.
3. This also drops the `org_id` column spec A added to it. Spec A's inventory
   said the "every table" rule had one exemption and `app_users` was not it —
   right at the time, wrong now: a single `org_id` on a user cannot express a
   many-to-many membership. The column goes with the table, not as an oversight.

## Notes

- Check the archived migrations are not in the applied path — they live in
  `supabase/migrations/_archive/` precisely so they are never replayed, but
  `_archive/035_app_users.sql` is the file that created this table and the hook,
  and it should not be edited to hide history.
- Green CI proves nothing here. The suite uses fakes throughout, constructs no
  database client, and the client is untyped — a dropped table would not fail a
  single test. Ticket 07 is the check that matters, which is why it runs after
  this rather than before: it verifies the real end state.

## Done when

- [x] `grep -rn "app_users" src/` returns nothing
- [x] The table no longer exists after `supabase db reset`
- [x] The spec-A `org_id` column on it is gone as a consequence
- [x] `supabase db diff --linked` reports no unexpected drift

## Comments

Implemented as a single new migration:

- `supabase/migrations/20260825130000_drop_app_users.sql` — `drop table
  public.app_users;`. No `CASCADE` needed: nothing in the migration history
  holds a foreign key into `app_users`, so the drop only takes its own
  primary key, its `auth.users` FK, its RLS (zero policies, same as
  `org_members`), its `org_id` FK from spec A, and its grants with it.
  `_archive/035_app_users.sql` (the original creation) was left untouched,
  per the ticket's note.

Verified:

- `grep -rn "app_users" src/` — no output (already true before this ticket,
  per tickets 02–05; confirmed still true after).
- `npx supabase db reset` — all six migrations apply cleanly in order,
  including the new drop; `\dt public.app_users` afterwards: "Did not find
  any relation named \"public.app_users\"."
- The dropped column is a consequence of the dropped table, not a separate
  step — there's no column left to check independently.
- `npx supabase db diff --linked` — the only reported diff is exactly the
  reverse of this migration (recreating `app_users`, its FKs, RLS and
  grants). `npx supabase migration list` confirms why: every prior
  migration through `20260825120000` is already applied on the linked
  remote; only this ticket's `20260825130000` is not. So the diff is fully
  explained by "this migration hasn't been pushed yet" — there is no other,
  unexplained drift. Pushing it to the linked project is deploy work for
  ticket 07, not this ticket.
