# 05 — Convert `payable-entries`

Status: ready-for-agent
Blocked by: 02
Spec: `../spec.md` (D2, D7, D13), ADR-0008

## Problem

7 query sites, 10 use cases, 2 output adapters. Straightforward: authenticated
throughout, no location-bearing table, no object storage.

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

## Notes

- A near-copy of the pilot. If anything does not fit ticket 02's pattern, that is
  a signal about the pattern, not about this module.

## Done when

- [ ] Every output port method in the module takes the organization explicitly
- [ ] Every query in the module is built through the helper
- [ ] The module imports no Supabase client and no Supabase package
- [ ] Existing tests pass with the organization threaded through
- [ ] Request and response shapes are unchanged
- [ ] The module README's Ports section reflects the new signatures
