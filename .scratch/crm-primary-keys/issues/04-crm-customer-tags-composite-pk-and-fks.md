# 04 — `crm_customer_tags`: composite FKs and its own composite PK

**What to build:** `crm_customer_tags` gets composite FKs on both columns —
`(org_id, customer_id) → crm_customers(org_id, id)` and
`(org_id, tag_name) → crm_tags(org_id, name)` — **and** its own primary key
widens from `(customer_id, tag_name)` to `(org_id, customer_id, tag_name)`.
Skipping the PK widening is the easy mistake here (spec D3): without it, two
organizations independently tagging their respective `'C001'` customer as
`'VIP'` collide on the join table's own PK even after the FKs are fixed.

After this ticket: two organizations can each tag their `'C001'` as `'VIP'`
(succeeds); the same `(org_id, customer_id, tag_name)` triple twice under
one organization still fails as a duplicate (unchanged behavior); org A
cannot reference org B's customer or tag in this table (rejected).

**Blocked by:** 01 (`crm_tags` composite PK) and 02 (`crm_customers`
composite PK). **Hard external dependency (per spec D7):**
`.scratch/composite-fk-indexes/spec.md`'s FK-widening technique must exist
**and be merged** before this is picked up — re-check before starting.

**Status:** ready-for-agent

- [ ] `crm_customer_tags` primary key is `(org_id, customer_id, tag_name)`
- [ ] FK to `crm_customers` is composite:
      `(org_id, customer_id) → crm_customers(org_id, id)`
- [ ] FK to `crm_tags` is composite:
      `(org_id, tag_name) → crm_tags(org_id, name)`
- [ ] Existing single-organization data migrates cleanly, no backfill needed
- [ ] Smoke test: two organizations each tag their own `'C001'` customer as
      `'VIP'` — both succeed
- [ ] Smoke test: the same `(org_id, customer_id, tag_name)` triple inserted
      twice under the same organization still fails as a duplicate
- [ ] Smoke test: org A cannot insert a `crm_customer_tags` row referencing
      org B's customer id or tag name — rejected
