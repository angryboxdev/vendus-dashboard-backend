# Supabase

Schema changes go through the Supabase CLI and migration files only.
**Nothing is ever pasted into the dashboard SQL Editor.** See
`docs/adr/0006-schema-baselined-migrations-archived.md` for why.

## One-time setup

```sh
brew install supabase/tap/supabase   # or: npx supabase <command>, no install needed
supabase login
supabase link --project-ref frbxmerhgnvhocwpuzrq
```

`supabase/config.toml` is already committed — `supabase init` does not need to
run again.

## Local development

```sh
supabase start   # Postgres + PostgREST + GoTrue + Studio, in Docker
supabase status  # prints API_URL and the anon/service keys for .env
```

Point the app at the local stack:

```
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<from `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>
```

Rebuild the local database from the migrations in this repo at any time:

```sh
supabase db reset
```

This replays every file in `supabase/migrations/` (not `_archive/`) against a
fresh Postgres. If it doesn't succeed, the migrations don't describe the
schema — fix the migration, not the running database.

## Making a schema change

```sh
supabase migration new <description>
# edit the generated supabase/migrations/<timestamp>_<description>.sql
supabase db reset          # replay locally, confirm it applies clean
supabase db diff --linked  # confirm the migration is the only diff from production
supabase db push --dry-run # confirm only the new migration would run
supabase db push           # apply to production
```

`supabase db diff --linked` is the drift detector. Run it before every push,
and periodically outside of any change, to catch anything that reached
production outside a migration.

## `_archive/`

`supabase/migrations/_archive/` holds the 81 migration files that predate this
repo baselining its schema (see ADR-0006). They are kept for intent and
history and are **never applied** — the CLI only reads
`supabase/migrations/*.sql` directly under that directory, not subfolders.
Do not move anything out of `_archive/` back into `migrations/`.

`supabase/migrations/<timestamp>_remote_schema.sql` is the baseline: the exact
schema pulled from production via `supabase db pull` on 2026-08-22, marked
applied in production's migration ledger without being executed (production
already contained its content). Every migration after it is a normal,
CLI-authored change.

## Never

`supabase db reset --linked` resets **production**. It is one flag away from
the routine local `supabase db reset`. Do not script it, do not alias it, and
read the full command before running anything with `--linked` in it.
