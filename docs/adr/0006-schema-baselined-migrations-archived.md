# The schema is baselined from production; the historical migrations are archived

The repo could not describe its own database. Four tables in daily use —
`suppliers`, `invoices`, `invoice_lines`, `classification_rules` — had no
`CREATE TABLE` in any migration; five further files under `docs/migrations/`
were applied by hand; two migrations shared the number `062`; and
`supabase/README.md` documented the process as pasting SQL into the Supabase
dashboard SQL Editor. Decided: baseline the live schema into a single generated
migration (`supabase db pull`), move the 80 historical migrations to
`supabase/migrations/_archive/`, and adopt the Supabase CLI as the only path for
schema change.

The alternative was to retro-fit — hand-write the missing tables, renumber the
duplicate, and iterate until a replay reproduced production. Rejected as
unbounded archaeology against a schema with two years of out-of-band edits, and
self-defeating: the result would have been verified by diffing it against
`db pull` output, which is the thing being reconstructed by hand. The historical
migrations' value as *documentation of intent* is real and survives untouched in
the archive and in git history. Their value as a *replayable build* was already
zero.

## Consequences

`supabase db reset` rebuilds the schema from the repo, which makes the local
Supabase stack (Postgres + PostgREST + GoTrue in Docker) a real rehearsal
environment — and turns "the repo's schema is the real schema" into a command:
`db reset` followed by `db diff --linked` reporting no drift.

The baseline is never executed against production. It enters the production
migration ledger via `supabase migration repair --status applied`, because
production already contains its content; every migration written afterwards is
applied normally by `db push`.

Two operational rules follow, and the first matters more than the mechanism:
**after baselining, no DDL goes through the SQL Editor** — baselining fixes
today's drift, not tomorrow's. And the archive must stay outside
`supabase/migrations/`, or `db push` will queue all 80 historical migrations for
production; `db push --dry-run` before every push is the check.

Related: `docs/MULTI_TENANCY_SAAS_DESIGN.md` §5.2;
`.scratch/org-location-foundation/spec.md` D1, issue 01.
