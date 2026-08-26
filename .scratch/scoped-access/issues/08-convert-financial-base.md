# 08 — Convert `financial-base`

Status: ready-for-agent
Blocked by: 02
Spec: `../spec.md` (D2, D7, D13), ADR-0008

## Problem

20 query sites, 23 use cases, 6 output adapters. This module also holds the
last hard-coded organization identifier in the source tree, injected at
composition time.

## Work

1. **Output ports gain the organization as an explicit first parameter**, using
   the branded type.
2. **Adapters take the helper factory** and build a scoped helper per invocation;
   every query moves onto the helper.
3. **Use cases carry the organization in their command input** and pass it down.
4. **Controllers read it from the request's auth payload.**
5. **Existing tests thread it through their fakes.**
6. **Update the module README's Ports section.**
7. **Remove the module-local hard-coded organization constant.** It exists
   because this module already needed an organization before one was available on
   the request. Now one is: authenticated paths take it from the auth payload, and
   any path without a user takes it from the unattended scope (D6). The constant
   itself must not survive this ticket.

## Not in scope

No behaviour change, no HTTP shape change, no column default dropped. Follow
ticket 02's pattern rather than inventing a local variation.

## Notes

- The hard-coded constant here is the one B1 noted as surviving into later specs.
  It is replaced, not relocated — if a value is still needed for a user-less path,
  it comes from the unattended scope file, which has a recorded deletion trigger.
- Supplier and cost-centre lookups are read by several other modules. Check for
  cross-module callers before changing a port signature.

## Done when

- [ ] Every output port method in the module takes the organization explicitly
- [ ] Every query in the module is built through the helper
- [ ] The module imports no Supabase client and no Supabase package
- [ ] Existing tests pass with the organization threaded through
- [ ] Request and response shapes are unchanged
- [ ] The module README's Ports section reflects the new signatures
- [ ] The module-local hard-coded organization constant is gone
