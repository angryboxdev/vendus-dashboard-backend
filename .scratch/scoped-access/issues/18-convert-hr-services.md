# 18 — Convert HR services

Status: ready-for-agent
Blocked by: 03
Spec: `../spec.md` (D8, D13)

## Problem

50 query sites across employees, shifts, attendance, payments, leave, documents,
audit and the kiosk, plus 4 more in the leave routes. The largest single area,
holding the most sensitive data in the product, and the reason the service-role
client exists at all. Two of its tables are location-bearing.

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
4. **Work shift and attendance writes supply a location explicitly** (D3/D4):
   from the caller on authenticated routes, from the unattended scope on the
   kiosk path (D14).
5. **The kiosk service takes its scope from the unattended scope**, including its
   employee PIN lookup, which is currently global across all employees.
6. **Convert the leave routes' own queries** as part of this ticket.

## Not in scope

No hexagonal migration. No restructuring, no renaming, no extraction of a domain
layer — those belong to a later spec, and D8 records the order. No behaviour
change and no HTTP shape change, beyond the new location field on
the shift and attendance write endpoints.

## Notes

- **Converted last on purpose.** It is the largest area and the most sensitive; it
  should be done by someone applying a settled pattern rather than inventing one.
  The risk argues for care, not for going first — D8 and D13.
- The four-digit PIN collision across organizations is **not** fixed here. Scoping
  the lookup to the unattended organization is correct while one organization
  exists; the collision is spec A's deferred item and carries a front-end contract
  change.
- The HR tables are the ones with real deny-by-default RLS from spec A. Nothing in
  this ticket changes that; the eventual org-claim policies are gated.
- Salary and payment data is why the service-role client spread. After this ticket
  no HR file holds a client at all.

## Done when

- [ ] Every exported function in the area takes the organization explicitly
- [ ] Every query in the area is built through the helper
- [ ] No file in the area imports the Supabase client or the Supabase package
- [ ] Route handlers pass the organization from the auth payload
- [ ] Behaviour and HTTP shapes are unchanged
- [ ] Work shifts and attendance carry an explicitly supplied location on every
      write path
- [ ] The kiosk path takes organization and location from the unattended scope
- [ ] The employee PIN lookup is organization-scoped
