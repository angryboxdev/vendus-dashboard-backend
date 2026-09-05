# 03 — Vendus integration: credentials & config end-to-end

**What to build:** Vendus stops reading `VENDUS_API_KEY`, `VENDUS_REGISTER_ID`
(and its `UBER_EATS_VENDUS_REGISTER_ID` fallback), and the price-group/
payment-method IDs from environment variables. Instead, the `vendus` module
resolves them per organization/location from the database. This is the full
vertical slice for Vendus — end to end, a real Vendus API call succeeds using
only database-backed configuration.

- `vendus_credentials` (one row per `org_id`): encrypted Vendus API key,
  using ticket 01's helper.
- `vendus_location_config` (one row per `org_id, location_id`): register ID,
  price-group IDs, payment-method IDs — plain columns, not encrypted.
- A `VendusCredentialsPort` (and equivalent for the config) in the `vendus`
  module's domain, implemented by a Supabase adapter.
- A one-time cutover script: read the current environment variable values,
  encrypt the secret, insert Angrybox's rows into both tables.

Cutover is a single verified deploy, not a dual-read transition: seed →
verify with a real Vendus call reading from the DB → flip the adapter to
read from the DB → remove the environment variables, all in the same change.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `vendus_credentials` and `vendus_location_config` tables exist, RLS
      enabled with zero policies (matching `organizations`/`locations`).
- [ ] A missing row for an org/location is reported as "not configured" by
      the port, not thrown as an error.
- [ ] The Vendus API key is stored encrypted (ticket 01's helper); the
      register ID and price-group/payment IDs are stored in plain columns.
- [ ] The seed/cutover script populates Angrybox's rows in both tables from
      the current environment variable values.
- [ ] A real Vendus API call (e.g. a catalog or analytics fetch) succeeds
      reading its credentials and register ID purely from the database, with
      the corresponding environment variables unset locally.
- [ ] `VENDUS_API_KEY`, `VENDUS_REGISTER_ID`, `UBER_EATS_VENDUS_REGISTER_ID`,
      and the Vendus price-group/payment-ID env vars are removed from
      `src/config/env.ts` and `render.yaml`.
- [ ] Adapter integration tests cover: write-then-read round-trips correctly
      (through encryption for the credentials table); a missing row reports
      not-configured.
- [ ] Domain/use-case unit tests for the new ports use fakes, per this
      module's existing test conventions.
