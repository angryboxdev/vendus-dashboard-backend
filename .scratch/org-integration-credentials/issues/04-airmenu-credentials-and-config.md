# 04 — AirMenu integration: credentials & config end-to-end

**What to build:** The same shape as ticket 03, for AirMenu. `air-menu`
stops reading `AIRMENU_API_KEY`, `AIRMENU_USERNAME`, `AIRMENU_PASSWORD`, and
`AIRMENU_CLOSING_ENTERPRISE_ID` from environment variables, resolving them
per organization/location from the database instead.

`AIRMENU_WEBHOOK_SECRET` is **not** migrated by this ticket, and stays a
global env var. The webhook is inbound and unauthenticated except by
signature — verifying it per-org first requires resolving which organization
sent it (from `enterpriseId` in the payload), and that enterprise→
organization mapping is the same one `AIRMENU_ENTERPRISES` already carries,
explicitly deferred to spec D (channels). Outbound credentials don't have
this problem: every outbound call already runs in a known organization's
context. `AIRMENU_ENTERPRISES` and `AIRMENU_WEBHOOK_URL` are also untouched
for the same reason / because they're only used interactively when
registering a webhook.

- `airmenu_credentials` (one row per `org_id`): encrypted API key, username,
  password — using ticket 01's helper.
- `airmenu_location_config` (one row per `org_id, location_id`): closing
  enterprise ID — plain column.
- An `AirMenuCredentialsPort` (and equivalent for the config) in the
  `air-menu` module's domain, implemented by a Supabase adapter.
- A one-time cutover script, same shape as ticket 03's.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `airmenu_credentials` and `airmenu_location_config` tables exist, RLS
      enabled with zero policies.
- [ ] A missing row for an org/location is reported as "not configured" by
      the port, not thrown as an error.
- [ ] API key, username, and password are stored encrypted; the closing
      enterprise ID is a plain column.
- [ ] The seed/cutover script populates Angrybox's rows in both tables from
      the current environment variable values.
- [ ] A real AirMenu API call succeeds reading its credentials purely from
      the database, with the corresponding environment variables unset
      locally.
- [ ] `AIRMENU_API_KEY`, `AIRMENU_USERNAME`, `AIRMENU_PASSWORD`, and
      `AIRMENU_CLOSING_ENTERPRISE_ID` are removed from `src/config/env.ts`
      and `render.yaml`. `AIRMENU_WEBHOOK_SECRET`, `AIRMENU_ENTERPRISES`,
      and `AIRMENU_WEBHOOK_URL` are left untouched — see the note above.
- [ ] Adapter integration tests cover: write-then-read round-trips correctly
      (through encryption for the credentials table); a missing row reports
      not-configured.
- [ ] Domain/use-case unit tests for the new ports use fakes.
