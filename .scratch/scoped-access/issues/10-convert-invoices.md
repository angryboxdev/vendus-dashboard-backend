# 10 — Convert `invoices`

Status: ready-for-agent
Blocked by: 02
Spec: `../spec.md` (D2, D7, D13), ADR-0008

## Problem

47 query sites, 19 use cases, 12 output adapters — the largest module. It also
owns the one location-bearing table outside the event-grain set: invoice lines,
where the location is **nullable** because a cost may belong to the organization
and to no store.

## Work

1. **Output ports gain the organization as an explicit first parameter**, using
   the branded type.
2. **Adapters take the helper factory** and build a scoped helper per invocation;
   every query moves onto the helper.
3. **Use cases carry the organization in their command input** and pass it down.
4. **Controllers read it from the request's auth payload.**
5. **Existing tests thread it through their fakes.**
6. **Update the module README's Ports section.**
7. **Invoice line writes accept an optional location** from the caller (D4).
   Nullable is a real state, not missing data: a cost belonging to the whole
   organization and to no store must remain expressible. Do not default it.
8. **The invoice document storage** goes through the wrapper moved in ticket 01,
   without path prefixing.

## Not in scope

No behaviour change, no HTTP shape change, no column default dropped. Follow
ticket 02's pattern rather than inventing a local variation.

## Notes

- The invoice header stays organization-level; only the line carries a location.
  §2.2 explains why, and nothing here should change it.
- This module reads the organization row for PDF headers (spec A's proof). That
  read is now an ordinary scoped query, keyed on the organization's own primary
  key per the registry.
- The front end starts sending a line location in ticket 19; until then the field
  is optional on the wire and absent in practice.

## Done when

- [ ] Every output port method in the module takes the organization explicitly
- [ ] Every query in the module is built through the helper
- [ ] The module imports no Supabase client and no Supabase package
- [ ] Existing tests pass with the organization threaded through
- [ ] Request and response shapes are unchanged
- [ ] The module README's Ports section reflects the new signatures
- [ ] Invoice line writes accept an optional location and leave it null when absent
