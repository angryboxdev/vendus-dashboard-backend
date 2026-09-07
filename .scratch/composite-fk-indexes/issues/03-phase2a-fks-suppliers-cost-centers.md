# 03 — Phase 2a: composite FKs — suppliers & cost-center domain

**What to build:** A write naming another organization's supplier,
cost-center category, cost-center group, or cost center is rejected by the
database, not by application code. Add `FOREIGN KEY (org_id, <col>)
REFERENCES <target> (org_id, id)` for every reference into `suppliers`,
`cost_center_categories`, `cost_center_groups`, and `cost_centers` (22
references), built online: `NOT VALID` first, `VALIDATE CONSTRAINT` after,
in its own statement.

**Blocked by:** 01 (ranking/exceptions), 02 (the `UNIQUE (org_id, id)`
indexes these constraints attach to).

**Status:** ready-for-agent

- [ ] All 22 references into `suppliers`, `cost_center_categories`,
      `cost_center_groups`, `cost_centers` have `NOT VALID` composite FKs,
      then successfully `VALIDATE CONSTRAINT`ed
- [ ] `supabase db reset` rebuilds the schema from the repository
- [ ] Table sizes checked before validating against production-shaped data
      locally, so lock duration isn't discovered live
- [ ] Smoke check per target table: a write naming the caller's own
      organization's identifier succeeds; the identical write naming a
      sibling organization's identifier is rejected with a named
      foreign-key-violation error
- [ ] Any reference with no caller-facing write path proven via direct SQL
      insertion instead of HTTP
