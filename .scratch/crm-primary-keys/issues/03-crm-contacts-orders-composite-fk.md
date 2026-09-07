# 03 — Composite FKs on `crm_contacts` and `crm_orders` to `crm_customers`

**What to build:** both tables' `customer_id text → crm_customers.id`
single-column FK becomes the composite `(org_id, customer_id) →
crm_customers(org_id, id)`. After this ticket, org A can no longer create a
contact or an order that references org B's customer id — the database
rejects it instead of silently linking across organizations. No application
code changes.

Same mechanical shape on both tables, hence one ticket.

**Blocked by:** 02 (`crm_customers` composite PK must exist first). **Hard
external dependency (per spec D7):** `.scratch/composite-fk-indexes/spec.md`'s
FK-widening technique must exist **and be merged** before this is picked up
— re-check before starting.

**Status:** ready-for-agent

- [ ] `crm_contacts`'s FK to `crm_customers` is composite:
      `(org_id, customer_id) → crm_customers(org_id, id)`
- [ ] `crm_orders`'s FK to `crm_customers` is composite:
      `(org_id, customer_id) → crm_customers(org_id, id)`
- [ ] Existing single-organization data migrates cleanly, no backfill needed
- [ ] Smoke test: org A cannot insert a `crm_contacts` row referencing org
      B's customer id — rejected
- [ ] Smoke test: org A cannot insert a `crm_orders` row referencing org B's
      customer id — rejected
- [ ] `crm_contacts.script_code` / any other unenforced column is untouched
      — this ticket does not add new FK enforcement beyond `customer_id`
      (see spec D5)
