# 14 — Convert supplier invoice import services

Status: ready-for-agent
Blocked by: 03
Spec: `../spec.md` (D8, D13)

## Problem

22 query sites. This area writes stock movements as a side effect of importing
a supplier invoice, which makes it location-bearing.

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
4. **Stock movement writes supply a location explicitly** (D4/D3). For an
   authenticated import the caller supplies it; the import must not rely on the
   column default.

## Not in scope

No hexagonal migration. No restructuring, no renaming, no extraction of a domain
layer — those belong to a later spec, and D8 records the order. No behaviour
change and no HTTP shape change, beyond the new location field on
the import request.

## Notes

- The extraction service in this area has no inbound imports and no queries; it is
  left alone beyond the import rule.
- This area and ticket 17 both write stock movements. They are separate tickets
  because they are separate call paths, but the location decision must be applied
  the same way in both.

## Done when

- [ ] Every exported function in the area takes the organization explicitly
- [ ] Every query in the area is built through the helper
- [ ] No file in the area imports the Supabase client or the Supabase package
- [ ] Route handlers pass the organization from the auth payload
- [ ] Behaviour and HTTP shapes are unchanged
- [ ] Stock movements written by an import carry an explicitly supplied location
