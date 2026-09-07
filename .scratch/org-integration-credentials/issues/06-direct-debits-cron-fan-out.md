# 06 — Direct-debits cron fan-out

**What to build:** `process-direct-debits` stops running once for
`UNATTENDED_SCOPE`'s hardcoded organization, and instead runs for every
organization, using ticket 02's fan-out utility. Unlike ticket 05, this cron
has no dependency on Vendus or AirMenu credentials — it operates on
`payable-entries`/`invoices` data already scoped by `org_id`, so there is no
"missing integration" skip case, only per-organization failure isolation.

**Blocked by:** 02

**Status:** done and verified

- [x] The cron processes every organization returned by ticket 02's
      organization listing, not a single hardcoded one.
- [x] A forced failure for one organization does not prevent other
      organizations from being processed in the same run.
- [x] A per-organization log line records success or failure.
- [x] `src/routes/internalCronRoutes.ts`'s direct-debits route no longer
      imports `UNATTENDED_SCOPE`.
- [x] Unit tests cover the fan-out wiring using fakes for the organization
      listing.

## Comments

`POST /internal/cron/process-direct-debits` now takes `listOrganizations`
(`src/infra/scoped-db/organization-listing.ts`, ticket 02) as an explicit
dependency alongside `processDirectDebits`, and runs `fanOut` (ticket 02)
over every organization, calling `ProcessDirectDebitsPort.execute(org.organizationId)`
per item. The processor never returns `not_configured` — per the deviation
note, this cron has no credential dependency, so there is no skip case, only
`fanOut`'s built-in per-item failure isolation and logging. The route
handler no longer imports or references `UNATTENDED_SCOPE` at all (the
import stays in the file only because the sibling `daily-vendus-consumption`
route, out of scope for this ticket, still uses it). `server.ts` wires the
real `listOrganizations` into `createInternalCronRouter`. Response body is
the raw `FanOutSummary` (`succeeded`/`skipped`/`failed`) instead of the
previous `{ processed }` single-org shape — no consumer depended on the old
shape (cron-only endpoint, `Authorization: Bearer <CRON_SECRET>`).

**Tests added:** `src/routes/__tests__/internalCronRoutes.test.ts` (4
tests, real Express router + a real `http.Server`, no supertest — mirrors
`location-credentials`'s existing route test pattern) — fans out over 3 fake
organizations, isolates one forced failure from the other two, asserts a
per-organization console log line on both success and failure, and asserts
the route 401s and never lists/processes organizations without a valid
cron secret.

**Verification:**
- `npx tsc --noEmit -p tsconfig.json` — clean.
- `npx depcruise src --config .dependency-cruiser.cjs` — "no dependency
  violations found (772 modules, 2841 dependencies cruised)".
- `npx jest --config jest.config.cjs src/routes/__tests__/internalCronRoutes.test.ts`
  — 4/4 passing.
- Full `npx jest --config jest.config.cjs` — 167 suites, 1392 tests, all
  passing.
- `src/modules/invoices/README.md` updated (Ports intro, two Design
  decisions bullets, endpoint table row, "Última atualização") to reflect
  the fan-out replacing `UNATTENDED_SCOPE` for this cron.
