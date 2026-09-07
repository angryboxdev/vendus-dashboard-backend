# 01 — Baseline the schema and stand up the local Supabase stack

Status: open
Blocked by: —
Spec: `../spec.md` (D1, ADR-0006)

## Problem

The repo cannot enumerate its own tables. `suppliers`, `invoices`,
`invoice_lines` and `classification_rules` are in daily use — 21, 21, 8 and 4
`.from()` call sites respectively — and have no `CREATE TABLE` anywhere. Five
more files under `docs/migrations/` were applied by hand. Two migrations are
both numbered `062`. `supabase/README.md` documents the process as pasting SQL
into the dashboard SQL Editor.

Spec A's criterion "no table lacks `org_id`" is a statement about the live
database that nothing in the repo can currently verify.

## Work

1. Install the CLI (`npx supabase` or `brew install supabase/tap/supabase`).
   Docker is already present.
2. `supabase init` — creates `supabase/config.toml`.
3. Move all 80 existing migrations to `supabase/migrations/_archive/`. They are
   kept in git for intent and archaeology, and are **never applied again**.
   Moving them out of `supabase/migrations/` is a safety step, not tidiness:
   left in place, `db push` would queue every one of them for production.
4. `supabase link --project-ref <ref>`.
5. `supabase db pull` — writes a baseline migration containing exactly what
   production has, including the four orphan tables and every hand-applied
   `ALTER` from `docs/migrations/`.
6. `supabase migration repair --status applied <baseline-version>` — writes the
   baseline into production's `supabase_migrations.schema_migrations` ledger
   **without executing it**. Production already contains its content.
7. `supabase migration list` — confirm local and remote agree. Do this
   explicitly rather than trusting `db pull` to have repaired the ledger; the
   behaviour varies across CLI versions.
8. `supabase start`, then `supabase db reset` — the baseline replays into the
   local stack from zero.
9. `supabase db diff --linked` — must report no drift.

## Notes

- The migration ledger does not exist yet (verified: `supabase_migrations`
  schema absent in production), so this is the clean case — no reconciliation
  needed.
- The local stack is Postgres **and** PostgREST **and** GoTrue. Bare Postgres
  would not do: every one of the 403 call sites goes through `supabase-js` →
  PostgREST over HTTP, so the app could not be smoke-tested against it, and
  `app_users.id REFERENCES auth.users(id)` needs the `auth` schema.
- Point the app at it with `SUPABASE_URL=http://localhost:54321` plus the local
  keys that `supabase start` prints.

## Discipline rule (the part that matters)

Baselining fixes today's drift; it does not prevent tomorrow's. **After this
issue lands, no DDL goes through the SQL Editor — every schema change is a
migration file.** `supabase db diff --linked` is the drift detector; run it
before every push.

## Never

`supabase db reset --linked` resets **production**. It is one flag away from the
routine local command. Do not script it, do not alias it.

## Done when

- [ ] `supabase/config.toml` exists; the 80 historical migrations are in `_archive/`
- [ ] The baseline migration is in `supabase/migrations/` and marked applied in production's ledger
- [ ] `supabase migration list` shows local and remote in sync
- [ ] `supabase db reset` rebuilds the schema locally from zero
- [ ] `supabase db diff --linked` reports no drift
- [ ] `supabase/README.md` is rewritten: the SQL-Editor instructions are gone, replaced by the CLI flow and the discipline rule
