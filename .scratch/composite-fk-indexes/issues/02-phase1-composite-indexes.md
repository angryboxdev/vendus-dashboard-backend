# 02 — Phase 1: composite `(org_id, …)` indexes, built online, planner-verified

**What to build:** Every `(org_id, …)` index this spec needs — both the
pure query-planner candidates from ticket 01's audit, and the
`UNIQUE (org_id, id)` constraints phase 2 will attach composite foreign
keys to on each of the ~22 distinct target tables — built with
`CREATE INDEX CONCURRENTLY` / `CREATE UNIQUE INDEX CONCURRENTLY` so nothing
locks a table with real data. This phase changes nothing about what a write
is allowed to do; its only claim is that the query planner can choose these
indexes for the query shapes the scoped query helper actually produces.

**Blocked by:** 01 (needs the confirmed index candidate list and the full
list of phase-2 target tables).

**Status:** ready-for-agent

- [ ] Resolved and documented the exact mechanism for disabling the
      Supabase CLI's transaction wrapping for a `CONCURRENTLY` statement
      against the installed CLI version (or used the manual-run +
      `db pull`/`db diff` route instead), since this repo has no prior
      example
- [ ] Every target table from ticket 01's inventory has a
      `UNIQUE (org_id, id)` index, built `CONCURRENTLY`
- [ ] Every pure query-planner candidate from ticket 01 has its
      `org_id`-prepended index, built `CONCURRENTLY`
- [ ] `hr_employees_kiosk_pin_hash_uq` untouched
- [ ] `supabase db reset` rebuilds the schema from the repository
- [ ] Planner verification per query shape: a second organization
      provisioned locally with real volume, `EXPLAIN (ANALYZE)` shows an
      index or bitmap heap scan naming the new index (not a sequential
      scan); where seeding realistic volume is impractical, `EXPLAIN` with
      `SET LOCAL enable_seqscan = off` instead, and the ticket's write-up
      records which tables needed that fallback
