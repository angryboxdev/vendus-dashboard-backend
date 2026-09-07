# 04 — Phase 2b: composite FKs — stock & CRM domain

**What to build:** A write naming another organization's stock item, stock
category, CRM customer, CRM tag, CRM contact, or CRM action type is
rejected by the database, not by application code. Add `FOREIGN KEY
(org_id, <col>) REFERENCES <target> (org_id, id)` for every reference into
`stock_items`, `stock_categories`, `crm_customers` (including its own
`referred_by` self-reference), `crm_tags`, `crm_contacts`, and
`crm_action_types` (15 references), built online: `NOT VALID` first,
`VALIDATE CONSTRAINT` after.

**Blocked by:** 01 (ranking/exceptions), 02 (the `UNIQUE (org_id, id)`
indexes these constraints attach to).

**Status:** ready-for-agent

- [ ] All 15 references into `stock_items`, `stock_categories`,
      `crm_customers`, `crm_tags`, `crm_contacts`, `crm_action_types` have
      `NOT VALID` composite FKs, then successfully `VALIDATE CONSTRAINT`ed
      (including `crm_customers.referred_by`)
- [ ] `supabase db reset` rebuilds the schema from the repository
- [ ] Table sizes checked before validating against production-shaped data
      locally
- [ ] Smoke check per target table: own-organization write succeeds;
      sibling-organization write rejected with a named foreign-key-violation
      error
- [ ] Any reference with no caller-facing write path proven via direct SQL
      insertion instead of HTTP
