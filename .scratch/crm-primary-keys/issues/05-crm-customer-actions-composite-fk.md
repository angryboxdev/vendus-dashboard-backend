# 05 — Composite FKs on `crm_customer_actions`

**What to build:** `crm_customer_actions` gets composite FKs on both
columns — `(org_id, customer_id) → crm_customers(org_id, id)` and
`(org_id, action_type_code) → crm_action_types(org_id, code)`. Its own
primary key is already a server-generated `uuid`, so no PK widening is
needed here (unlike ticket 04's join table). This table is queried through
the new-pattern module (`src/modules/crm/adapters/out/supabase-crm-workspace.repository.ts`),
not just the legacy service layer — worth a smoke test through that path
too.

After this ticket: org A cannot record a customer action referencing org
B's customer or action type — rejected instead of silently linking across
organizations.

**Blocked by:** 01 (`crm_action_types` composite PK) and 02
(`crm_customers` composite PK). **Hard external dependency (per spec D7):**
`.scratch/composite-fk-indexes/spec.md`'s FK-widening technique must exist
**and be merged** before this is picked up — re-check before starting.

**Status:** ready-for-agent

- [ ] FK to `crm_customers` is composite:
      `(org_id, customer_id) → crm_customers(org_id, id)`
- [ ] FK to `crm_action_types` is composite:
      `(org_id, action_type_code) → crm_action_types(org_id, code)`
- [ ] Existing single-organization data migrates cleanly, no backfill needed
- [ ] Smoke test: org A cannot insert a `crm_customer_actions` row
      referencing org B's customer id or action-type code — rejected
- [ ] `crm_customer_actions.script_code` stays unenforced — this ticket
      does not add new FK enforcement beyond `customer_id` /
      `action_type_code` (see spec D5)
- [ ] `crm_customer_actions.source_key`'s pre-existing global unique
      constraint is untouched — out of scope (see spec's "Noted, not
      decided")
