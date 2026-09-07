# 05 — Daily Vendus consumption cron fan-out

**What to build:** `daily-vendus-consumption` stops running once for
`UNATTENDED_SCOPE`'s hardcoded org/location, and instead processes every
`(org, location)` pair that has Vendus configured, using ticket 02's fan-out
utility and ticket 03's Vendus ports.

- List every `(org, location)` pair (ticket 02).
- For each pair, look up `vendus_credentials` (org) and
  `vendus_location_config` (location); a pair missing either is skipped.
- Run the existing consumption use case per pair through the fan-out utility,
  so one pair's failure doesn't stop the rest.
- This cron stops importing `UNATTENDED_SCOPE`.

**Blocked by:** 02, 03

**Status:** won't-do — the `daily-vendus-consumption` cron is disabled and
there's no plan to re-enable it. Ticket 07's smoke test was rescoped to
cover ticket 06's direct-debits fan-out instead.

- [ ] The cron (both the HTTP route and the standalone script) processes
      every `(org, location)` pair with Vendus configured, not a single
      hardcoded pair.
- [ ] A pair with no `vendus_credentials` row for its org, or no
      `vendus_location_config` row for that location, is skipped, not
      errored.
- [ ] A forced failure for one pair (e.g. a bad credential, a simulated API
      error) does not prevent other pairs from being processed in the same
      run.
- [ ] A per-pair log line records success, skip, or failure.
- [ ] `src/routes/internalCronRoutes.ts`'s consumption route and
      `src/jobs/runDailyVendusConsumption.ts` no longer import
      `UNATTENDED_SCOPE`.
- [ ] Unit tests cover the fan-out wiring using fakes for the listing and
      credential/config ports.
