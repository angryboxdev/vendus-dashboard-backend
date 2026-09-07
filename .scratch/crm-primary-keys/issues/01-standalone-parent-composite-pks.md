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

**Status:** ready-for-agent

- [ ] `crm_parameters` primary key is `(org_id, key)`
- [ ] `crm_scripts` primary key is `(org_id, code)`
- [ ] `crm_tags` primary key is `(org_id, name)`
- [ ] `crm_action_types` primary key is `(org_id, code)`
- [ ] Existing single-organization (Angrybox) data migrates cleanly, no
      backfill needed (`org_id` already populated on every row)
- [ ] Smoke test: two organizations each insert a parameter/script/tag/
      action-type row reusing the same key/code/name — both succeed
- [ ] Migration technique matches whatever `.scratch/composite-fk-indexes/`
      settled on
