# 16 — Convert CRM services

Status: ready-for-agent
Blocked by: 03
Spec: `../spec.md` (D8, D13)

## Problem

29 query sites across customers, contacts, orders, scripts, parameters and the
dashboard.

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

- The CRM tables use human-assigned text primary keys, so every organization's
  first customer would collide. That is spec A's deferred item and is **not** fixed
  here — see the register. Threading the organization does not resolve it, because
  the collision is in the key itself.
- The partly-refactored CRM module is ticket 07. Neither blocks the other.

## Done when

- [ ] Every exported function in the area takes the organization explicitly
- [ ] Every query in the area is built through the helper
- [ ] No file in the area imports the Supabase client or the Supabase package
- [ ] Route handlers pass the organization from the auth payload
- [ ] Behaviour and HTTP shapes are unchanged
