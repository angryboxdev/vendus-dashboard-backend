# 01 — Audit pass: rank the 65 composite-FK targets, confirm phase-1's index candidates

**What to build:** A ranked, complete inventory that the rest of this spec
builds from — not code. For phase 2: every one of the 65 pre-existing
foreign-key references, ranked by risk and user-facing-ness (an HR employee
id reached from an authenticated write endpoint ranks above a
`dre_custos_fixos` classification-rule reference nobody's UI supplies
directly), with the two named exceptions (`crm_customer_actions.created_by`
→ `auth.users`, and `bank_movement_entity_links`'s polymorphic
`(entity_type, entity_id)` pair) flagged explicitly rather than folded into
the mechanical count. For phase 1: the actual `WHERE`/`ORDER BY` shapes the
scoped query helper's call sites produce today, checked against the 96
existing indexes, so the index batch targets query shapes that exist, not
every index that happens to exist.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Ranked table of all 65 references produced, covering every target
      table in the spec's starting inventory (Further Notes), with nothing
      added or dropped without explanation
- [ ] The two named exceptions are flagged in the table, not silently
      counted toward the mechanical 63
- [ ] Phase 1's candidate list of `(org_id, …)` indexes is confirmed against
      the scoped query helper's actual call sites, with `hr_employees_kiosk_pin_hash_uq`
      explicitly excluded
- [ ] Completeness check: every row from the spec's D6 inventory appears
      exactly once in the ranked table
