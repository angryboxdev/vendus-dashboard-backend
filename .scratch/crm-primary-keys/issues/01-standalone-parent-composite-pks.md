# 01 — Composite PKs for the four standalone CRM parent tables

**What to build:** `crm_parameters`, `crm_scripts`, `crm_tags`, and
`crm_action_types` each keep their existing business-key column but the
primary key widens to include `org_id`: `crm_parameters (org_id, key)`,
`crm_scripts (org_id, code)`, `crm_tags (org_id, name)`,
`crm_action_types (org_id, code)`. After this ticket, two different
organizations can each define a `'reminder_days'` parameter, a `'2.1.1'`
script, a `'VIP'` tag, and a `'follow-up'` action type without a unique-
constraint collision. No application code changes — every call site already
scopes by `org_id` (spec's D8).

Follow whatever migration technique (`CREATE UNIQUE INDEX CONCURRENTLY` +
`NOT VALID`/`VALIDATE`, vs. plain synchronous `ADD CONSTRAINT`) the
composite-FK-indexes spec settles on for consistency (spec's D6). These four
tables have no dependents of their own being touched in this ticket — that's
tickets 03-05.

**Blocked by:** None from this feature's own ticket set — can start as soon
as the frontier reaches it. **Hard external dependency (per spec D7):**
`.scratch/composite-fk-indexes/spec.md`'s FK-widening technique must exist
**and be merged** (a migration in `supabase/migrations/`, not just a written
spec) before this is picked up. Re-check that before starting — as of this
ticket's authoring, that spec is drafted (`Status: ready-for-agent`) but not
yet implemented.

**Status:** done, verified

- [x] `crm_parameters` primary key is `(org_id, key)`
- [x] `crm_scripts` primary key is `(org_id, code)`
- [x] `crm_tags` primary key is `(org_id, name)`
- [x] `crm_action_types` primary key is `(org_id, code)`
- [x] Existing single-organization (Angrybox) data migrates cleanly, no
      backfill needed (`org_id` already populated on every row)
- [x] Smoke test: two organizations each insert a parameter/script/tag/
      action-type row reusing the same key/code/name — both succeed
- [x] Migration technique matches whatever `.scratch/composite-fk-indexes/`
      settled on

## Implementation notes

- Migration: `supabase/migrations/20260909090000_crm_standalone_parent_composite_pks.sql`.
- `crm_parameters`/`crm_scripts` had zero FK dependents, so their pkey swap
  was a plain synchronous `DROP CONSTRAINT` / `ADD CONSTRAINT ... PRIMARY KEY
  (org_id, key|code)` — no `CONCURRENTLY` needed.
- `crm_tags`/`crm_action_types` reused the `UNIQUE (org_id, name|code)`
  indexes the composite-fk-indexes spec already built
  (`crm_tags_org_id_name_uq`, `crm_action_types_org_id_code_uq`) via
  `ADD CONSTRAINT ... PRIMARY KEY USING INDEX` — Postgres renamed the index
  to the new constraint name automatically. Their old, now-redundant
  single-column FKs (`crm_customer_actions_action_type_code_fkey`,
  `crm_customer_tags_tag_name_fkey`) were dropped first, since Postgres
  refuses to drop a pkey while an FK still points at it; the composite FKs
  the earlier spec added already cover the same relationship.
- Cascade preservation: the dropped `crm_customer_tags_tag_name_fkey` had
  `ON DELETE CASCADE`; the composite FK that replaced it
  (`crm_customer_tags_org_id_tag_name_fkey`) originally did not, so it was
  dropped and recreated with `ON DELETE CASCADE` added, keeping
  cascade-delete behavior on `crm_tags` unchanged. `crm_action_types` never
  had a cascade, so its composite FK was left as-is.
- No deviations from the plan.
- Smoke test: run as direct SQL against the local Supabase DB (`docker exec
  ... psql`, no app/auth layer), after a clean `supabase db reset` applied
  the migration with no errors. Used two throwaway orgs
  (`11111111-1111-1111-1111-111111111111` / `22222222-2222-2222-2222-222222222222`,
  `organizations.nif` required a value too — `SMOKE-NIF-A`/`SMOKE-NIF-B`).
  Inserted one row per table (`crm_parameters`, `crm_scripts`, `crm_tags`,
  `crm_action_types`) under each org reusing the same key/code/name — all
  8 inserts succeeded and were committed. Then, in separate statements,
  confirmed a same-org duplicate insert on each of the four tables fails
  with a `duplicate key value violates unique constraint "<table>_pkey"`
  error naming `(org_id, key|code|name)`. Cleaned up: deleted all 8 test
  rows plus the 2 throwaway orgs; table/`organizations` row counts back to
  pre-test (seed) values afterward.
