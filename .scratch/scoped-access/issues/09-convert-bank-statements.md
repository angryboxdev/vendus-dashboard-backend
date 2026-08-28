# 09 — Convert `bank-statements`

Status: ready-for-agent
Blocked by: 02
Spec: `../spec.md` (D2, D7, D13), ADR-0008

## Problem

40 query sites, 22 use cases, 13 output adapters — the second largest module,
and the one with the most adapters.

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

- 13 adapters means 13 constructor changes. Convert them mechanically; resist
  consolidating them while passing through.
- The reconciliation paths join across bank movements and payable entries. Embedded
  selects are not organization-filtered — that is understood and accepted (D16),
  and the composite keys that would close it are gated. Do not add per-embed
  filters here.

## Done when

- [ ] Every output port method in the module takes the organization explicitly
- [ ] Every query in the module is built through the helper
- [ ] The module imports no Supabase client and no Supabase package
- [ ] Existing tests pass with the organization threaded through
- [ ] Request and response shapes are unchanged
- [ ] The module README's Ports section reflects the new signatures
