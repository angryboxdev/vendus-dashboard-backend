# 06 — Phase 2d: composite FKs — invoicing, pizza & misc domain

**What to build:** A write naming another organization's invoice, supplier
invoice import, pizza, pizza recipe, channel, preparation, recurring
contract, or payable entry is rejected by the database, not by application
code. Add `FOREIGN KEY (org_id, <col>) REFERENCES <target> (org_id, id)`
for every reference into `invoices`, `supplier_invoice_imports` (including
its own self-reference), `pizzas`, `pizza_recipes`, `channels`,
`preparations`, `recurring_contracts`, and `payable_entries` (15
references), built online: `NOT VALID` first, `VALIDATE CONSTRAINT` after.
`invoices` has carried real production data since day one — check its size
before validating.

**Blocked by:** 01 (ranking/exceptions), 02 (the `UNIQUE (org_id, id)`
indexes these constraints attach to).

**Status:** ready-for-agent

- [ ] All 15 references into `invoices`, `supplier_invoice_imports`,
      `pizzas`, `pizza_recipes`, `channels`, `preparations`,
      `recurring_contracts`, `payable_entries` have `NOT VALID` composite
      FKs, then successfully `VALIDATE CONSTRAINT`ed (including
      `supplier_invoice_imports`' self-reference)
- [ ] `supabase db reset` rebuilds the schema from the repository
- [ ] `invoices`' size checked before validating; lock duration confirmed
      acceptable
- [ ] Smoke check per target table: own-organization write succeeds;
      sibling-organization write rejected with a named foreign-key-violation
      error
- [ ] Any reference with no caller-facing write path proven via direct SQL
      insertion instead of HTTP
