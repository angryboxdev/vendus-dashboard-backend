# 07 — Convert `crm`

Status: ready-for-agent
Blocked by: 02
Spec: `../spec.md` (D2, D7, D13), ADR-0008

## Problem

19 query sites, 1 output adapter, and no use cases — the module's README
records its status as *em refactor*, so it is part-built.

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

Do not finish the refactor. Convert what exists.

## Notes

- This module is mid-refactor and does not have the full port/use-case shape. Add
  the organization parameter to whatever structure is actually there rather than
  completing the hexagonal migration on the way past.
- The legacy CRM services are a separate ticket (16). Both must be done before the
  final migration; neither blocks the other.

## Done when

- [ ] Every output port method in the module takes the organization explicitly
- [ ] Every query in the module is built through the helper
- [ ] The module imports no Supabase client and no Supabase package
- [ ] Existing tests pass with the organization threaded through
- [ ] Request and response shapes are unchanged
- [ ] The module README's Ports section reflects the new signatures
