# 06 — Convert `payable-recurrences`

Status: ready-for-agent
Blocked by: 02
Spec: `../spec.md` (D2, D7, D13), ADR-0008

## Problem

18 query sites, 21 use cases, 6 output adapters, plus document storage.

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

Object-storage paths are **not** re-prefixed by organization (D17). The storage
wrapper moved into the helper's folder in ticket 01; this ticket only routes the
module's calls through it.

## Notes

- Two storage adapters in this module were moved behind a named wrapper in ticket
  01. Ensure the module calls the wrapper rather than reaching for the client.
- Recurrence occurrences are generated in bulk; check that bulk inserts are
  stamped by the helper rather than carrying a hand-written organization field.

## Done when

- [ ] Every output port method in the module takes the organization explicitly
- [ ] Every query in the module is built through the helper
- [ ] The module imports no Supabase client and no Supabase package
- [ ] Existing tests pass with the organization threaded through
- [ ] Request and response shapes are unchanged
- [ ] The module README's Ports section reflects the new signatures
