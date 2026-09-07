# 04 — Convert `vendus`

Status: ready-for-agent
Blocked by: 02
Spec: `../spec.md` (D2, D7, D13), ADR-0008

## Problem

2 query sites, 6 use cases, 3 output adapters. The smallest remaining
module, and mostly an HTTP client to the POS rather than a database consumer.

## Work

1. **Output ports gain the organization as an explicit first parameter**, using
   the branded type.
2. **Adapters take the helper factory** and build a scoped helper per invocation;
   every query moves onto the helper.
3. **Use cases carry the organization in their command input** and pass it down.
4. **Controllers read it from the request's auth payload.**
5. **Existing tests thread it through their fakes.**
6. **Update the module README's Ports section.**

## Not in scope

No behaviour change, no HTTP shape change, no column default dropped. Follow
ticket 02's pattern rather than inventing a local variation.

The split of this module into a core sales module and a POS connector is spec D's
work (§3.3). Do not start it here.

## Notes

- Most of this module talks to the POS API, not to the database. Only the
  mapping and cache reads touch tables; do not invent an organization parameter
  for the pure HTTP paths.
- The global POS credential stays as it is. Replacing it is spec C.

## Done when

- [x] Every output port method in the module takes the organization explicitly
- [x] Every query in the module is built through the helper
- [x] The module imports no Supabase client and no Supabase package
- [x] Existing tests pass with the organization threaded through
- [x] Request and response shapes are unchanged
- [x] The module README's Ports section reflects the new signatures
