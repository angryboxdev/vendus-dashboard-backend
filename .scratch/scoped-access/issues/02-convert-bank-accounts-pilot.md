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

- [x] Every `bank-accounts` output port method takes the organization explicitly
- [x] Every query in the module is built through the helper
- [x] The module imports no Supabase client and no Supabase package
- [x] The module's existing tests pass with the organization threaded through
- [x] Request and response shapes are unchanged
- [x] The module README's Ports section reflects the new signatures
- [x] The pattern is described briefly in the README so the next eighteen tickets
      have something to copy

## Comments

**House style settled (written into the module README's "Isolamento por
organização (spec B2)" section):**

- Output ports: `organizationId: OrganizationId` as a separate first
  parameter on every method, per D2 — never folded into an existing filter
  object.
- Input ports (use cases): `organizationId` rides as a field inside the
  command/query object `execute()` already took. A port that used to take a
  bare primitive (`execute(id: string)`) or nothing (`execute()`) now takes
  an object instead, named `<Verb><Entity>Command` for writes and
  `<Verb><Entity>Query` for reads (e.g. `GetBankQuery = { organizationId, id }`).
  This keeps every use case called the same way — one object — rather than
  two calling conventions depending on whether the port already had fields.
- Controller: reads `req.auth!.orgId`, never the body or params, and writes
  it into the command *after* spreading the request body (not before) —
  see the next point.
- Adapters: constructor takes `ScopedQueryFactory`, calls
  `this.scopedQuery(organizationId).table(...)` per operation.

**A real bug the conversion surfaced, not introduced by it:** the PATCH
handlers built the command as `{ organizationId: req.auth!.orgId, id: ...,
...body }`. Spreading `body` *after* the trusted fields means a request body
containing an `organizationId` (or `id`) key would silently override them —
exactly the cross-tenant write vector this whole spec exists to close. Fixed
by spreading `body` first and the trusted fields last. Worth a grep across
the other eighteen tickets' controllers once they're converted, since this
is a copy-paste hazard by construction (the original unscoped code had the
same ordering, just with lower stakes — only `id` could be overridden, not
tenancy).

**The ticket's premise that this pilot has "no unattended path" didn't
survive contact with the cross-module wiring.** `bank-accounts` exposes
`accountRepo` for bank-statements' auto-link-on-import feature, injected via
structural typing (no shared port type) — `SupabaseBankAccountRepository`
happened to match bank-statements' `BankAccountReadPort` shape. Giving
`BankAccountRepositoryPort` an explicit `organizationId` first parameter (as
this ticket requires) breaks that structural match: bank-statements hasn't
been converted yet (ticket 09, blocked by this one) and has no per-request
organization to hand back across the module boundary at its own composition
root.

Rather than invent a local port-signature variation to route around it, the
fix stays inside `bank-accounts`: a new `BankAccountCrossModuleReadAdapter`
wraps the now-scoped repository and re-exposes the old, organization-less
shape by supplying `UNATTENDED_SCOPE.organizationId`. This is a no-op today
(only one organization exists — spec.md's hard gate on provisioning a
second one is what makes this safe rather than a live isolation hole), is
documented as temporary in both the adapter and the README, and ticket 09
deletes it once bank-statements threads its own request organization
through. Flagging this pattern for the remaining tickets: **any module that
exposes a repository cross-module via structural typing instead of a shared
port will hit this same break**, and the fix is the same shape (a small
bridge adapter using `UNATTENDED_SCOPE`, deleted when the second module
converts) rather than a per-ticket improvisation.

**`scoped-query.ts` (ticket 01) gained one thing this ticket needed:** the
table facade's `select()` only forwarded `columns`, not the native builder's
`options` (`{ head, count }`). `countStatements` needs
`.select("id", { count: "exact", head: true })`, which D1 explicitly
promises keeps working ("counts ... keep working unchanged"). Added
`options` as a second, optional, passthrough parameter — additive, no
existing caller changes — plus a unit test on the helper itself
(`scoped-query.test.ts`) asserting the options are forwarded.
