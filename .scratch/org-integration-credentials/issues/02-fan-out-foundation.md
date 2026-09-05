# 02 — Fan-out foundation: generic per-item utility + org/location listing

**What to build:** The shared mechanism both crons will use to process every
organization (or organization/location pair) instead of one hardcoded pair —
built once, used twice. Two independent pieces:

1. A generic fan-out utility: given a list of items and a per-item async
   function, it processes each item independently, treats a "not configured"
   result as a skip (not an error), catches and logs any other per-item
   failure without stopping the remaining items, and returns a summary of
   what succeeded, what was skipped, and what failed.
2. Queries to list every organization, and every `(org, location)` pair —
   nothing in this codebase currently lists organizations at all, so this is
   new, not a refactor.

**Blocked by:** None — can start immediately

**Status:** done, verified

- [x] The fan-out utility accepts a list of items and a per-item processor,
      and returns a summary distinguishing succeeded / skipped / failed
      items.
- [x] An item whose processor reports "not configured" is recorded as
      skipped, not failed.
- [x] One item's thrown error is caught, logged, and recorded as failed
      without preventing the remaining items from being processed.
- [x] A query lists every row in `organizations`.
- [x] A query lists every `(org_id, location_id)` pair across `locations`.
- [x] Unit tests cover the fan-out utility's skip/isolate/summarize behavior
      using fakes — no DB involved for this ticket's utility test; the
      listing queries get a light integration test against the local stack.

## Comments

**Fan-out utility** — `src/utils/fan-out.ts`. Exports `fanOut<T>(items,
processor, options?)`, `FanOutProcessorResult` (`{ status: "success" } |
{ status: "not_configured"; reason?: string }` — the discriminated union the
processor returns instead of throwing for "not configured"),
`FanOutItemResult<T>` and `FanOutSummary<T>` (`succeeded` / `skipped` /
`failed` arrays of `{ item, status, reason? }`). Runs items through the
existing `mapLimit` utility (`src/utils/mapLimit.ts`, default concurrency 5,
overridable via `options.concurrency`) rather than unbounded
`Promise.all`, reusing what was already in `src/utils/` instead of adding a
second concurrency primitive. Logs one line per item via `console` (or an
injected `options.logger`) on every outcome — success, skip, or failure —
using `options.describeItem` (default `JSON.stringify`) to identify the item,
so both crons (tickets 05/06) get their "per-item log line" requirement for
free from this one utility instead of re-implementing logging per cron.

**Listing queries** — new unscoped "doors" in `src/infra/scoped-db/`
(`organization-listing.ts` → `listOrganizations()`,
`organization-location-listing.ts` → `listOrganizationLocationPairs()`),
following the existing unscoped-door pattern in that folder
(`membership-lookup.ts`, `device-token-lookup.ts`, `pairing-code-lookup.ts`):
call `getSupabaseServiceRole()` directly, return a typed row array with
`organizationId` minted via `mintOrganizationId`. They live in
`scoped-db/` (not `src/modules/locations/`, which only has a per-organization
scoped read) because the `supabase-so-no-scoped-db` dependency-cruiser rule
restricts `@supabase/supabase-js` imports to this one folder — these queries
are structurally cross-organization and can't go through `ScopedQuery`
(D7: constructible only from an already-known `OrganizationId`), so this is
the only compliant home. Unlike the lookup-by-key doors in this folder (which
fail-quiet, returning `null`/`[]`, appropriate for auth/pairing paths), both
new queries throw on a query error or an unconfigured client — matching
`createScopedQuery`'s and the repository adapters' fail-loud convention —
since a cron silently "processing zero organizations" on a transient DB
error is exactly the invisible-failure mode this spec exists to close.
No filtering (e.g. `is_active`) is applied — the ticket's "every" is taken
literally; ticket 05/06 apply any integration-specific skip logic themselves.

Sanity-checked both interfaces against tickets 05 and 06 (not implemented):
`OrgLocationPairRow`/`OrganizationRow` pass directly as `fanOut`'s item type,
`describeItem` composes org/location ids for readable pair logs, and
`FanOutProcessorResult`'s `not_configured` branch is exactly what ticket 05's
per-pair vendus-credentials/vendus-location-config skip needs while ticket
06 (no skip case) can just never return that branch.

**Tests added:**
- `src/utils/__tests__/fan-out.test.ts` (5 tests, fakes only) — not-configured
  → skipped, one throw isolated from the rest, mixed success/skip/fail
  counts, non-`Error` throw coerced to a string reason, `describeItem` used
  in the log line.
- `src/infra/scoped-db/__tests__/organization-listing.integration.test.ts`
  (2 tests) — ran against the **local Supabase stack** (already running via
  Docker in this environment; no `supabase` CLI installed, but the stack's
  containers were up, `supabase_kong` reachable on `127.0.0.1:54321`).
  Asserts each query's result includes Angrybox's seeded org/location row,
  same approach as `location-credentials`'s existing integration test
  (mocks `supabase-client.js`, no cleanup needed — read-only).

**Verification:**
- `npx tsc --noEmit -p tsconfig.json` — clean.
- `npx depcruise src --config .dependency-cruiser.cjs` — "no dependency
  violations found (716 modules, 2624 dependencies cruised)".
- `npx jest --config jest.config.cjs src/utils/__tests__/fan-out.test.ts src/infra/scoped-db/__tests__/organization-listing.integration.test.ts`
  — 2 suites, 7 tests, all passing.
- Full `npm test` was not run, per instructions (someone else runs it once
  at the end). No module README update needed — this ticket is infra
  utilities + query functions, not a `src/modules/` module.
