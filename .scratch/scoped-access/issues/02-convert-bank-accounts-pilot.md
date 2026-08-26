# 02 — Convert `bank-accounts` (pilot: establishes the pattern)

Status: ready-for-agent
Blocked by: 01
Spec: `../spec.md` (D2, D7, D13), ADR-0008

## Problem

Nineteen further areas will be converted by copying whatever this ticket does.
The pattern has to be reviewed before it is copied, not after.

`bank-accounts` is the pilot because it is the smallest clean case: 12 query
sites, 10 use cases, 2 output adapters, fully authenticated, no location-bearing
table, no unattended path, no object storage.

## Work

1. **Output ports gain the organization as an explicit first parameter** on every
   method, using the branded type from ticket 01.
2. **Adapters take the helper factory** at composition time instead of a Supabase
   client, and build a scoped helper per invocation. Every query moves onto the
   helper.
3. **Use cases carry the organization in their command input** and pass it to the
   ports.
4. **The controller reads it from the request's auth payload** and puts it in the
   command.
5. **Existing use case tests thread it through their fakes.** No new test
   infrastructure — the organization is just another argument.
6. **Update the module README's Ports section**, since every signature changed.

## Not in scope

No behaviour change. No HTTP request or response shape changes. No column default
is dropped.

## Notes

- **This ticket defines the house style for eighteen others.** Spend the review
  effort here. In particular settle, and write into the README: where the
  organization sits in a command input; whether it is a separate first parameter
  on the port or part of an existing argument object (the spec says separate
  first parameter — D2); and how the controller names it.
- The pilot is deliberately a module with no location-bearing table, so the
  location decisions are not entangled with the pattern decisions. Ticket 03
  exercises those next.
- If threading the organization makes a port signature awkward, say so in the
  ticket comments rather than inventing a local variation — a divergence here
  multiplies by nineteen.

## Done when

- [ ] Every `bank-accounts` output port method takes the organization explicitly
- [ ] Every query in the module is built through the helper
- [ ] The module imports no Supabase client and no Supabase package
- [ ] The module's existing tests pass with the organization threaded through
- [ ] Request and response shapes are unchanged
- [ ] The module README's Ports section reflects the new signatures
- [ ] The pattern is described briefly in the README so the next eighteen tickets
      have something to copy
