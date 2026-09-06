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

- [x] `airmenu_credentials` and `airmenu_location_config` tables exist, RLS
      enabled with zero policies.
- [x] A missing row for an org/location is reported as "not configured" by
      the port, not thrown as an error.
- [x] API key, username, and password are stored encrypted; the closing
      enterprise ID is a plain column.
- [x] The seed/cutover script populates Angrybox's rows in both tables from
      the current environment variable values.
- [ ] A real AirMenu API call succeeds reading its credentials purely from
      the database, with the corresponding environment variables unset
      locally. — **not verifiable here**, see Comments.
- [x] `AIRMENU_API_KEY`, `AIRMENU_USERNAME`, `AIRMENU_PASSWORD`, and
      `AIRMENU_CLOSING_ENTERPRISE_ID` are removed from `src/config/env.ts`
      and `render.yaml`. `AIRMENU_WEBHOOK_SECRET`, `AIRMENU_ENTERPRISES`,
      and `AIRMENU_WEBHOOK_URL` are left untouched — see the note above.
- [x] Adapter integration tests cover: write-then-read round-trips correctly
      (through encryption for the credentials table); a missing row reports
      not-configured.
- [x] Domain/use-case unit tests for the new ports use fakes.

## Comments

**Migration** — `supabase/migrations/20260905090000_create_airmenu_credentials_tables.sql`:
`airmenu_credentials` (one row per `org_id`, unique + FK to `organizations`,
three `*_encrypted text not null` columns) and `airmenu_location_config`
(one row per `org_id, location_id`, composite FK to `locations(org_id, id)`
+ unique constraint + index, matching `location_tokens`/`pairing_codes`'
pattern). Both RLS-enabled, zero policies, same posture/rationale as those
two tables (comment in the migration spells out why). Applied directly to
the local stack (`psql` inside the `supabase_db_*` container, then a manual
row in `supabase_migrations.schema_migrations`) — no linked project and no
bare `supabase` CLI binary in this environment (only reachable via `npx
supabase`, which needs a link for `migration list`/`db push`); verified the
tables exist and the previous migration
(`20260903072439_create_location_credentials_tables.sql`) was already
applied before adding this one.

**Table registry** — `src/infra/scoped-db/table-registry.ts`: added both
tables exactly as specified (`airmenu_credentials`: org-only;
`airmenu_location_config`: location-bearing).

**Domain** — `src/modules/air-menu/domain/`:
- `entities/air-menu-credentials.ts`, `entities/air-menu-location-config.ts`
  — plain interfaces, no behaviour, matching `AirMenuEnterprise`'s style.
- `ports/out/air-menu-credentials.port.ts`,
  `ports/out/air-menu-location-config.port.ts` — read-only ports, exactly
  the shape the ticket specifies (`found | not_configured` discriminated
  unions).
- `services/resolve-closing-enterprise-id.ts` — the one bit of real logic
  extracted: the pure `found|not_configured → string|null` mapping
  `server.ts` needs to feed `createCashClosingsModule`. Everything else
  about these two ports is bootstrap-time config resolution with no
  behaviour to unit-test beyond the ports' own contract shape — see the
  "no use-case" decision below.

**No use-case layer for the two new ports** (judgement call, per the
ticket's own suggestion to decide and note it): `server.ts` calls the two
Supabase adapters directly, the same way it already consumes
`createAirMenuModule`'s `getSummary`/`eventBus` straight from the
composition root without an extra use-case wrapper. This is bootstrap-time
config resolution (run once, at process start), not a request-time domain
flow — wrapping it in an input port/use-case would add a layer with no
orchestration logic in it. Documented in the module README under "Ports"
and "Decisões de design".

**Adapters** — `src/modules/air-menu/adapters/out/`:
- `supabase-air-menu-credentials.repository.ts` — `getByOrganization`
  implements the port (`select(...).maybeSingle()`, decrypts the three
  columns, `not_configured` on no row, throws `error.message` on a Supabase
  error). `upsert(organizationId, credentials)` — additional surface, not
  part of the port, used only by the cutover script; encrypts and
  `upsert(..., { onConflict: "org_id" })`.
- `supabase-air-menu-location-config.repository.ts` — same shape,
  `getByLocation`/`upsert(organizationId, locationId, config)`,
  `onConflict: "org_id,location_id"`.

Encryption/decryption lives inside the adapter (symmetric read/write), not
in the cutover script — the script hands the adapter plaintext read from
`process.env` and lets it own the encrypt-on-write side, the mirror of
`getByOrganization`'s decrypt-on-read. Kept the two concerns (column
mapping + cifra) in one place instead of splitting them between the script
and the adapter.

**Composition root wiring:**
- `src/modules/cash-closings/cash-closings.module.ts`:
  `createCashClosingsModule` gained a third param,
  `closingEnterpriseId?: string | null`, replacing its internal read of
  `ENV.AIRMENU_CLOSING_ENTERPRISE_ID`. JSDoc updated.
- `src/server.ts`: now resolves AirMenu credentials/config from the
  database before constructing `airMenuModule`/`cashClosingsModule` — two
  new repositories constructed with `createScopedQuery`, an `await` on
  `getByOrganization(UNATTENDED_SCOPE.organizationId)` that throws
  (crashes boot) if `not_configured`, and a location-config lookup that
  degrades to `null` (via `resolveClosingEnterpriseId`) instead of
  throwing — mirrors the ticket's pseudocode exactly. Top-level `await` —
  valid here (`"type": "module"`, runs under `tsx` and plain `node` alike).
- `src/modules/cash-closings/adapters/out/air-menu-delivery.gateway.ts`:
  updated a stale comment that referenced the now-removed env var.

**Env** — `src/config/env.ts`: removed `AIRMENU_API_KEY`,
`AIRMENU_USERNAME`, `AIRMENU_PASSWORD`, `AIRMENU_CLOSING_ENTERPRISE_ID` (and
their doc comments). `AIRMENU_ENTERPRISES`, `AIRMENU_WEBHOOK_SECRET`,
`AIRMENU_WEBHOOK_URL` untouched. **`render.yaml`** — confirmed via
`grep -n AIRMENU render.yaml` (no matches) that it never had any
`AIRMENU_*` entries to begin with — nothing to remove there.

**Cutover script** — `src/jobs/runAirMenuCredentialsCutover.ts`: reads
`AIRMENU_API_KEY`/`USERNAME`/`PASSWORD` from `process.env` (throws if any
missing/blank), always upserts credentials; reads
`AIRMENU_CLOSING_ENTERPRISE_ID` and upserts the location config only if
present, otherwise logs a skip notice and leaves that table alone (keeps
the "optional" semantics intact for orgs that never set it). Idempotent via
the adapters' `onConflict` upserts. `package.json` scripts added:
`airmenu:cutover-credentials` / `airmenu:cutover-credentials:dev`, mirroring
`org:provision`/`org:provision:dev`.

**Dependency-cruiser** — `.dependency-cruiser.cjs`: added the new
integration test's path to the `supabase-so-no-scoped-db` rule's exception
list (same reason as the existing `location-credentials` exception: the
test constructs its own `@supabase/supabase-js` client to point at the
local stack).

**Local environment note**: this worktree had no `.env` file at all
(gitignored, not checked out with the worktree) — every test/verification
step below needed one to exist, since `src/config/env.ts` throws at import
time on missing required vars, and `encryption.ts` imports `ENV`. Created a
local-only `.env` (dummy `VENDUS_*`/`SUPABASE_*` values, a freshly generated
`CREDENTIALS_ENCRYPTION_KEY`, `AIRMENU_ENTERPRISES`) so the suite could run
at all in this environment; pointed `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
at the local stack (`http://127.0.0.1:54321`, the fixed local demo keys) to
run the cutover script and the bootstrap-wiring verification below. Not
committed (gitignored).

**Tests added:**
- `src/modules/air-menu/__tests__/fakes/fake-air-menu-credentials-port.ts`,
  `fake-air-menu-location-config-port.ts` — in-memory fakes for both new
  ports, for this ticket's own test and for future consumers (e.g. a
  fan-out ticket that needs to fake AirMenu config per organization).
- `src/modules/air-menu/__tests__/services/resolve-closing-enterprise-id.test.ts`
  (4 tests) — proves the `found`/`not_configured` contract shape via the
  fakes, and `resolveClosingEnterpriseId`'s pure mapping in both branches.
- `src/modules/air-menu/__tests__/integration/supabase-air-menu-credentials.integration.test.ts`
  (5 tests) — local Supabase stack, `supabase-client.js` mocked, seeded
  against `UNATTENDED_SCOPE`, cleaned up in `afterEach`. Covers:
  write-then-read round-trip through encryption (asserts the raw DB row
  differs from the plaintext), `upsert` idempotency (second upsert
  overwrites, row count stays 1), and `not_configured` for a
  never-configured organization/location, for both tables.

**Verification:**
- `npx tsc --noEmit -p tsconfig.json` — clean, no errors.
- `npx depcruise src --config .dependency-cruiser.cjs` — "no dependency
  violations found (728 modules, 2665 dependencies cruised)".
- `npx jest --config jest.config.cjs` (targeted: `air-menu`, `cash-closings`,
  `location-credentials`, `infra/scoped-db`, `infra/crypto`) — all green;
  also ran the **full** `npm test`-equivalent (`npx jest --config
  jest.config.cjs`, no pattern) as an extra check since this ticket touched
  shared files (`config/env.ts`, `infra/scoped-db/table-registry.ts`,
  `.dependency-cruiser.cjs`) — 158 suites, 1319 tests, all passing.
- Ran `src/jobs/runAirMenuCredentialsCutover.ts` for real against the local
  stack (`AIRMENU_API_KEY=test-api-key AIRMENU_USERNAME=test-user
  AIRMENU_PASSWORD=test-pass AIRMENU_CLOSING_ENTERPRISE_ID=1783676282106
  npx tsx src/jobs/runAirMenuCredentialsCutover.ts`) — upserted both rows
  for Angrybox; confirmed via `psql` that the stored columns are ciphertext,
  not plaintext.
- Built and ran a throwaway harness mirroring `server.ts`'s new bootstrap
  block (constructed, run, then deleted — not part of the diff) with
  `AIRMENU_API_KEY`/`USERNAME`/`PASSWORD`/`CLOSING_ENTERPRISE_ID` **unset**
  in the environment: it read the credentials and config purely from the
  seeded DB rows (decrypted values matched what the cutover script wrote),
  resolved `closingEnterpriseId`, and successfully constructed
  `createAirMenuModule(...)` with them — i.e. it proves the wiring end to
  end, not a live call to the real AirMenu API.

**Left unchecked and why:** "A real AirMenu API call succeeds reading its
credentials purely from the database, with the corresponding environment
variables unset locally." This environment has no outbound network access
to the real AirMenu API, and this repo has no VCR/cassette/`nock` fixture
convention for it (`grep -rn "nock\|vcr\|cassette" package.json src` — no
matches) to fake a recorded response honestly. What was verified instead
(see above) is that the exact code path `server.ts` runs at boot resolves
real, decrypted AirMenu credentials purely from the database with those
four env vars unset, and successfully constructs the module with them — the
wiring is proven; the live HTTP round-trip to AirMenu itself is not. To
close this out: run `npm run airmenu:cutover-credentials:dev` once against
a real Supabase project with the real `AIRMENU_API_KEY`/`USERNAME`/
`PASSWORD`/`CLOSING_ENTERPRISE_ID` set, then unset those four env vars and
`npm run dev`, then hit `GET /api/air-menu/summary?enterpriseId=...` (or any
other authenticated AirMenu route) and confirm it returns real data.
