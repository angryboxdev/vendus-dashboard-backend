# 17 — Convert stock services and the two standalone jobs

Status: ready-for-agent
Blocked by: 03
Spec: `../spec.md` (D8, D13)

## Problem

30 query sites across items, categories, movements, adjustments and consumption,
plus the two standalone jobs that write through them. Stock movements are
location-bearing.

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
4. **Stock movement writes supply a location explicitly** (D3/D4): from the
   caller on authenticated routes, from the unattended scope in the jobs.
5. **Convert the two standalone jobs in this ticket**, not separately — they write
   through the same service, and splitting them means opening the same file twice
   (D13). Both take their organization and location from the unattended scope (D6),
   passed as ordinary arguments.
6. **Add the organization argument to the stored procedure** that aggregates stock
   movements, filter on it, and expose it through the helper so it cannot be
   invoked unscoped (D17). It is currently executable by anonymous callers with no
   organization predicate at all.

## Not in scope

No hexagonal migration. No restructuring, no renaming, no extraction of a domain
layer — those belong to a later spec, and D8 records the order. No behaviour
change and no HTTP shape change, beyond the new location field on
the movement write endpoints.

## Notes

- Per-organization cron fan-out is spec C. Here the jobs simply name the
  organization they already act for, explicitly instead of by database default.
- The stored procedure change is the one piece of SQL in this ticket. It is in
  scope by B2's own done-criterion, not as an exception to D16: a database function
  reading a tenant table without an organization predicate is a hole in the claim
  that the helper is the only place a query is built.
- One file in this area has no inbound imports; it is converted, not deleted (D9).

## Done when

- [ ] Every exported function in the area takes the organization explicitly
- [ ] Every query in the area is built through the helper
- [ ] No file in the area imports the Supabase client or the Supabase package
- [ ] Route handlers pass the organization from the auth payload
- [ ] Behaviour and HTTP shapes are unchanged
- [ ] Stock movements carry an explicitly supplied location on every write path
- [ ] Both standalone jobs take their scope from the unattended scope file
- [ ] The stored procedure takes and filters on an organization, and is reachable
      only through the helper
