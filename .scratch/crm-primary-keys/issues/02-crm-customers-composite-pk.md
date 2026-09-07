# 02 — Composite PK for `crm_customers`, including the self-referencing FK

**What to build:** `crm_customers` primary key widens from `id text` to
`(org_id, id)`. Its self-referencing `referred_by text references
crm_customers(id)` becomes the composite `(org_id, referred_by) →
crm_customers(org_id, id)`. After this ticket, two organizations can each
create a customer with `id = 'C001'` (exactly what `nextCustomerId()`
already generates per-organization,
`src/services/crmCustomerService.ts:83-93`) without a unique-constraint
collision, and org A can't set `referred_by` to org B's customer id.

`crm_customers.id` stays a plain text value with the same shape and meaning
— it's a live public API path parameter (`GET/PATCH /crm/customers/:id`).
No frontend or route contract change (spec's D1). No other application code
changes — every call site already scopes by `org_id`.

This ticket does not touch `crm_contacts`, `crm_orders`,
`crm_customer_tags`, or `crm_customer_actions` — their FKs into
`crm_customers` are tickets 03-05.

**Blocked by:** None from this feature's own ticket set. **Hard external
dependency (per spec D7):** `.scratch/composite-fk-indexes/spec.md`'s
FK-widening technique must exist **and be merged** before this is picked up
— re-check before starting.

**Status:** ready-for-agent

- [ ] `crm_customers` primary key is `(org_id, id)`
- [ ] `referred_by`'s self-referencing FK is composite:
      `(org_id, referred_by) → crm_customers(org_id, id)`
- [ ] Existing single-organization data migrates cleanly, no backfill needed
- [ ] Smoke test: two organizations each insert a customer with `id =
      'C001'` — both succeed
- [ ] Smoke test: org A cannot set `referred_by` to org B's customer id —
      rejected by the composite FK
- [ ] `GET`/`PATCH /crm/customers/:id` and the other routes at
      `src/routes/crmRoutes.ts` are unaffected — `id` is still the plain
      text value in requests/responses
