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

- [x] Every output port method in the module takes the organization explicitly
- [x] Every query in the module is built through the helper
- [x] The module imports no Supabase client and no Supabase package
- [x] Existing tests pass with the organization threaded through
- [x] Request and response shapes are unchanged
- [x] The module README's Ports section reflects the new signatures

## Comments

Followed ticket 02's pattern exactly (this worktree branched before ticket
02 merged, so the pilot's actual implementation — commit
`feat: convert bank accounts module to organization id` — was read directly
from the top-level branch rather than from a merged copy in this worktree):

- Output ports (`PayableEntryRepositoryPort`, `InvoiceReadPort`):
  `organizationId: OrganizationId` as a separate first parameter on every
  method (D2).
- Input ports: `organizationId` added as a field on every existing
  command/query object. Three ports that previously took a bare primitive —
  `CancelPayableEntryPort.execute(id: string)`, `GetPayableEntryPort.execute(id: string)`,
  `DeletePayableEntryPort.execute(id: string)` — gained new object types
  (`CancelPayableEntryCommand`, `GetPayableEntryQuery`, `DeletePayableEntryCommand`
  respectively, each `{ organizationId, id }`). `ListPayableEntriesFilter`
  (shared by `ListPayableEntriesPort` and `GetPayableSummaryPort`) stopped
  being optional, since it now always carries a required `organizationId`.
- Controller: reads `req.auth!.orgId`; on writes, the trusted fields
  (`organizationId`, `id`) are spread *after* the request body, per the bug
  ticket 02 flagged (a body containing those keys must never override the
  caller's own values).
- Adapters: constructor takes `ScopedQueryFactory`; both
  `SupabasePayableEntryRepository` and `SupabaseInvoiceReadAdapter` build a
  scoped helper per call.
- No cross-module structural-typing break here (unlike `bank-accounts`'
  `accountRepo`): this module doesn't expose a repository to another module.
  `invoices` and `payable-recurrences` each already declare their own local,
  independent write ports (`PayableEntryWritePort`) with their own Supabase
  adapters straight onto `payable_entries` — those are each module's own
  ticket to convert, not this one's.
- No changes needed to `scoped-query.ts` — this module never calls `.select()`
  with count/head options, so ticket 02's `options` passthrough addition
  wasn't required here.
