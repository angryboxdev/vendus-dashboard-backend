# 06 — Direct-debits cron fan-out

**What to build:** `process-direct-debits` stops running once for
`UNATTENDED_SCOPE`'s hardcoded organization, and instead runs for every
organization, using ticket 02's fan-out utility. Unlike ticket 05, this cron
has no dependency on Vendus or AirMenu credentials — it operates on
`payable-entries`/`invoices` data already scoped by `org_id`, so there is no
"missing integration" skip case, only per-organization failure isolation.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The cron processes every organization returned by ticket 02's
      organization listing, not a single hardcoded one.
- [ ] A forced failure for one organization does not prevent other
      organizations from being processed in the same run.
- [ ] A per-organization log line records success or failure.
- [ ] `src/routes/internalCronRoutes.ts`'s direct-debits route no longer
      imports `UNATTENDED_SCOPE`.
- [ ] Unit tests cover the fan-out wiring using fakes for the organization
      listing.
