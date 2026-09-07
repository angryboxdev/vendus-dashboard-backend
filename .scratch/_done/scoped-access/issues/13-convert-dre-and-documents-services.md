# 13 — Convert DRE and documents services

Status: ready-for-agent
Blocked by: 03
Spec: `../spec.md` (D8, D13)

## Problem

8 query sites across the fixed-cost, variable-cost, KPI and gross-revenue
services plus the documents service.

These are legacy files. Per D8 they are **threaded, not migrated** — every
exported function gains the organization as its first parameter and every query
moves onto the helper, but no file is rearchitected. CLAUDE.md's instruction to
propose a hexagonal migration before extending legacy code has already been
answered for this spec: the answer is no, and the reasoning is in D8.

## Work

1. **Every exported function gains the organization as its first parameter**,
   using the branded type.
2. **Every query moves onto the scoped helper.** No file in this area may import
   the Supabase client afterwards.
3. **Route handlers pass the organization from the request's auth payload.**

## Not in scope

No hexagonal migration. No restructuring, no renaming, no extraction of a domain
layer — those belong to a later spec, and D8 records the order. No behaviour
change and no HTTP shape change.

## Notes

- The gross-revenue service reads the POS API on every render rather than a local
  ledger. That is §3.3's problem and spec D's fix; here it only needs an
  organization on the table reads it does perform.
- These modules must stay free of restaurant vocabulary in any domain layer they
  later grow (§3, the seam that keeps Variant B reachable). Threading a parameter
  does not affect that, but do not take the opportunity to add domain concepts.

## Done when

- [ ] Every exported function in the area takes the organization explicitly
- [ ] Every query in the area is built through the helper
- [ ] No file in the area imports the Supabase client or the Supabase package
- [ ] Route handlers pass the organization from the auth payload
- [ ] Behaviour and HTTP shapes are unchanged
