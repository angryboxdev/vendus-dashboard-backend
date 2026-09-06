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

**Status:** done, verified

- [x] `vendus_credentials` and `vendus_location_config` tables exist, RLS
      enabled with zero policies (matching `organizations`/`locations`).
- [x] A missing row for an org/location is reported as "not configured" by
      the port, not thrown as an error.
- [x] The Vendus API key is stored encrypted (ticket 01's helper); the
      register ID and price-group/payment IDs are stored in plain columns.
- [x] The seed/cutover script populates Angrybox's rows in both tables from
      the current environment variable values.
- [x] A real Vendus API call (e.g. a catalog or analytics fetch) succeeds
      reading its credentials and register ID purely from the database, with
      the corresponding environment variables unset locally.
- [x] `VENDUS_API_KEY`, `VENDUS_REGISTER_ID`, `UBER_EATS_VENDUS_REGISTER_ID`,
      and the Vendus price-group/payment-ID env vars are removed from
      `src/config/env.ts` and `render.yaml`.
- [x] Adapter integration tests cover: write-then-read round-trips correctly
      (through encryption for the credentials table); a missing row reports
      not-configured.
- [x] Domain/use-case unit tests for the new ports use fakes, per this
      module's existing test conventions.

## Comments

**Migration** — `supabase/migrations/20260905120000_vendus_credentials_and_location_config.sql`.
Two tables, RLS enabled with zero policies (matching `organizations`/
`locations`/`location_tokens`/`pairing_codes`):
- `vendus_credentials`: PK `org_id`, `encrypted_api_key text`, timestamps. FK
  to `organizations(id)`.
- `vendus_location_config`: composite PK `(org_id, location_id)`,
  `register_id text`, `eatz_payment_id`/`apps_payment_id`/
  `salao_price_group_id`/`eatz_price_group_id integer`, timestamps.
  Composite FK to `locations(org_id, id)`, same shape as
  `20260903072439_create_location_credentials_tables.sql`.

Applied to the local Supabase stack directly via
`docker exec supabase_db_vendus-dashboard-backend psql -U postgres -d postgres < <migration file>`
(no `supabase` CLI installed locally; `npx supabase` works but a plain
`psql`-over-docker apply was simpler and is exactly what `supabase db reset`
would have run for this one file). Both tables added to
`src/infra/scoped-db/table-registry.ts` (`vendus_credentials`:
`organizationColumn: "org_id"`, not location-bearing;
`vendus_location_config`: `organizationColumn: "org_id"`, location-bearing).

**Domain** (`src/modules/vendus/domain/`):
- `entities/vendus-credentials.ts` — `VendusCredentials { apiKey }`.
- `entities/vendus-location-config.ts` — `VendusLocationConfig { registerId,
  eatzPaymentId, appsPaymentId, salaoPriceGroupId, eatzPriceGroupId }`.
- `ports/out/vendus-credentials.port.ts` — `VendusCredentialsPort.
  getByOrganization/save`, `VendusCredentialsResult` discriminated union
  (`{status:"configured";credentials} | {status:"not_configured"}`) —
  deliberately mirrors ticket 02's `FanOutProcessorResult` shape per this
  ticket's brief, not a thrown error or a nullable return.
- `ports/out/vendus-location-config.port.ts` — same shape,
  `getByOrganizationAndLocation`/`save`.
- `ports/in/resolve-vendus-boot-config.port.ts` — `ResolveVendusBootConfigPort.
  execute({organizationId, locationId}) → VendusBootConfig` (api key + the
  five location-config fields flattened into one object). Not a
  business-facing input port — see "Boot-time resolution" below.

**Application**:
`application/use-cases/resolve-vendus-boot-config.use-case.ts` —
`ResolveVendusBootConfigUseCase`, takes both output ports in its
constructor, calls both `getByOrganization`/`getByOrganizationAndLocation`,
and **throws** (not a soft failure) if either comes back `not_configured` —
same fail-fast spirit as `env.ts`'s `must(...)`, since a half-configured
production boot silently degrading is worse than a crash. Unit-tested with
fakes: `src/modules/vendus/__tests__/use-cases/resolve-vendus-boot-config.use-case.test.ts`
(3 tests — fully configured resolves correctly; missing credentials throws;
missing location config throws), using new fakes
`__tests__/fakes/fake-vendus-credentials.ts` and
`__tests__/fakes/fake-vendus-location-config.ts`.

**Adapters** (`src/modules/vendus/adapters/out/`):
- `supabase-vendus-credentials.adapter.ts` — `SupabaseVendusCredentialsAdapter`,
  takes `ScopedQueryFactory` (never holds a `SupabaseClient`, same pattern as
  `SupabaseAnalyticsCacheAdapter`). Encrypts on `save` / decrypts on
  `getByOrganization` using ticket 01's `encrypt`/`decrypt`
  (`src/infra/crypto/encryption.ts`). Unlike the analytics cache, failures
  are **not** swallowed — this is boot-time config, not a best-effort cache,
  so a DB error propagates as a thrown error.
- `supabase-vendus-location-config.adapter.ts` —
  `SupabaseVendusLocationConfigAdapter`, same `ScopedQueryFactory` pattern,
  plain columns (no encryption). `location_id` is stamped explicitly on
  `save()` (only `org_id` is auto-stamped by `ScopedQuery`), same convention
  as `SupabaseCashClosingRepository`.

**Boot-time resolution** — `vendus.module.ts` exports a new
`resolveVendusBootConfig(organizationId, locationId)` alongside
`createVendusModule`: constructs both concrete adapters via
`createScopedQuery`, runs `ResolveVendusBootConfigUseCase`, returns the
merged `VendusBootConfig`. This is the composition root's job (it already
owns which concrete adapters exist), not a use case reachable from any
controller — `server.ts` is its only caller, once, at boot.

**Architecture decision — confirmed as scoped, no changes needed**:
1. `vendusClient.ts` — replaced its direct `ENV.API_KEY` read with a
   module-level singleton: `setVendusApiKey(key)` setter + private
   `getApiKey()` getter (throws if never set), used by all four exported
   functions (`vendusGet`, `vendusPatch`, `vendusBasicWrite`,
   `vendusGetBasic`). Zero changes to any of the 8 legacy files that import
   this module — they call the same functions and transparently get the
   DB-sourced key.
2. `cash-closings.module.ts` — `createCashClosingsModule` gained a second
   parameter, `vendusRegisterId: string` (between `vendusGateway` and the
   optional `airMenuSummary`), passed straight into
   `VendusRegisterSessionsGateway`'s constructor instead of
   `ENV.VENDUS_REGISTER_ID`.
3. `server.ts` — module body is now effectively async: `await
   resolveVendusBootConfig(UNATTENDED_SCOPE.organizationId,
   UNATTENDED_SCOPE.locationId)` runs before `createVendusModule`/
   `createCashClosingsModule`, immediately followed by `setVendusApiKey(...)`.
   Top-level `await` works as-is under this repo's `nodenext`/`esnext`
   TypeScript config — no wrapper `bootstrap()` function needed, confirmed
   by booting the real server (see Verification).
4. `env.ts` — removed `API_KEY`, `VENDUS_REGISTER_ID` (with its
   `UBER_EATS_VENDUS_REGISTER_ID` fallback), `VENDUS_EATZ_PAYMENT_ID`,
   `VENDUS_APPS_PAYMENT_ID`, `VENDUS_PRICE_GROUP_SALAO`,
   `VENDUS_PRICE_GROUP_EATZ`. `VENDUS_BASE_URL` and the
   per-page/concurrency/selfconsumption vars untouched, as scoped.
5. `render.yaml` — removed `VENDUS_API_KEY` from both services (web +
   `vendus-daily-vendus-consumption` cron); `.env.example` — removed
   `VENDUS_API_KEY` (it never listed the register/price-group vars, so
   nothing else to remove there).

No new use case was needed on top of the ports themselves for anything
besides boot resolution — the six existing business use cases are
untouched.

**Cutover script** — `src/jobs/runVendusCredentialsCutover.ts` (+ npm scripts
`vendus:credentials-cutover` / `:dev`, matching `org:provision`'s
convention). Reads `VENDUS_API_KEY`, `VENDUS_REGISTER_ID` (falling back to
`UBER_EATS_VENDUS_REGISTER_ID`) and the four price/payment vars **directly
from `process.env`**, with the same defaults `env.ts` used to hardcode (not
via `ENV`, which no longer carries them), and upserts
`UNATTENDED_SCOPE`'s org/location rows into both tables through the two new
adapters (constructed via `createScopedQuery`, exactly like a composition
root). Safe to re-run (both writes are upserts). Actually run against the
local Supabase stack using the real production `VENDUS_API_KEY`/
`UBER_EATS_VENDUS_REGISTER_ID` values from the main worktree's `.env`
(read once for this purpose, never printed — the script's own output masks
the api key). Confirmed the row landed via
`docker exec ... psql -c "select org_id, length(encrypted_api_key), created_at from vendus_credentials;"`
(80-char ciphertext, as expected for a 32-char key) and the location config
row with the real register id `275787597` and the four default price/
payment IDs.

**This worktree's local `.env`** — this worktree had no `.env` at all
(gitignored, not shared across git worktrees). Created one pointing
`SUPABASE_URL`/`SUPABASE_(ANON|SERVICE_ROLE)_KEY` at the local stack
(`127.0.0.1:54321`, the Supabase CLI's fixed local "demo" keys — not
secrets), a freshly generated `CREDENTIALS_ENCRYPTION_KEY`, and placeholder
values for `AIRMENU_*`/`OPENAI_API_KEY`/`HR_KIOSK_HMAC_SECRET` (required by
`env.ts`'s `must()` but not exercised by this ticket's work). Does **not**
include `VENDUS_API_KEY`/`VENDUS_REGISTER_ID`/`UBER_EATS_VENDUS_REGISTER_ID`/
the four price-group vars — confirming they're genuinely unused by the app
now, not just unread.

**Real Vendus API call verification (step 9)** — wrote a throwaway script
(`src/jobs/__verify_vendus_db_boot.ts`, deleted after use — not part of the
deliverable) that: (1) asserts all seven legacy Vendus env vars are unset in
`process.env`; (2) calls `resolveVendusBootConfig(UNATTENDED_SCOPE.
organizationId, UNATTENDED_SCOPE.locationId)`; (3) calls
`setVendusApiKey(...)` with the resolved key; (4) calls the real
`vendusGet("/products/", {per_page:1})` against the real Vendus API
(`https://www.vendus.pt/ws`). Output: boot config resolved correctly from
the DB (`registerId: "275787597"`, the four default price/payment IDs, api
key present), followed by a real Vendus API response — one product
(`"1906 Reserva Especial 33cl"`) with its `prices[]`, `stock`, etc. — proving
the full path (DB → decrypt → `setVendusApiKey` → `vendusGet` → real Vendus
API) end to end with the four env vars genuinely absent.

Also smoke-tested the real `server.ts` boot (`npx tsx src/server.ts`, killed
after a few seconds): boots cleanly under the new async top-level-await
flow and serves `GET /api/health` → `{"ok":true}` while running.

**Tests added:**
- `src/modules/vendus/__tests__/use-cases/resolve-vendus-boot-config.use-case.test.ts`
  (3 tests, fakes only).
- `src/modules/vendus/__tests__/integration/supabase-vendus-credentials-and-location-config.integration.test.ts`
  (5 tests, local Supabase stack, same mocking approach as
  `location-credentials`'s integration test): credentials write-then-read
  round trip through encryption; api key confirmed stored encrypted (not
  plain text) at the row level; credentials not-configured for a
  nonexistent org; location-config write-then-read round trip;
  location-config not-configured for a nonexistent location. Added this
  file's exact path to `.dependency-cruiser.cjs`'s
  `supabase-so-no-scoped-db` exception list (same as
  `location-credentials`'s integration test) since it builds its own
  `@supabase/supabase-js` client for the local stack.

**Documentation:**
- `src/modules/vendus/README.md` — updated "Isolamento por organização",
  added "Resolução de configuração no boot" section, updated Ports/Adapters
  tables, added two Design decisions (the `vendusClient.ts` singleton
  trade-off; fail-loud at boot), replaced the env-var config table with a
  pointer to the DB tables + cutover script, updated "Como testar" and
  "Pontos de atenção".
- `src/modules/cash-closings/README.md` — updated the two mentions of
  `registerId` coming from `VENDUS_REGISTER_ID` to describe the new
  parameter-injection-from-DB path.
- `docs/adr/0010-vendus-config-resolved-from-db-at-boot.md` — new ADR:
  records the decision (boot-time DB resolution + the `vendusClient.ts`
  singleton), the rejected alternative (per-request threading through every
  legacy consumer), and the fail-loud-at-boot call. Judged this crosses the
  module-README threshold because it's used by two modules (`vendus` +
  `cash-closings`) and is the kind of decision (a mutable singleton instead
  of per-request DI) a future reader would otherwise question. Did **not**
  touch `CONTEXT.md` (no new domain vocabulary) or write the
  encryption-mechanism/key-rotation-runbook ADR — that's ticket 08's
  explicit scope, not duplicated here.
- Did **not** touch `unattended-scope.ts`'s header comment — confirmed via
  ticket 08 (`.scratch/org-integration-credentials/issues/08-closing-adr-and-corrections.md`)
  that correction belongs there, not here.

**Verification:**
- `npx tsc --noEmit -p tsconfig.json` — clean, no errors.
- `npx depcruise src --config .dependency-cruiser.cjs` — "no dependency
  violations found (729 modules, 2670 dependencies cruised)".
- `npx jest --config jest.config.cjs --testPathPattern="src/modules/vendus|src/modules/cash-closings" --no-coverage`
  — 22 suites, 245 tests, all passing.
- `npm test` (full suite) — 158 suites, 1318 tests, all passing.
- Cutover script run against the local Supabase stack (see above) — rows
  confirmed via direct `psql` query.
- Real Vendus API call proof (step 9, see above) — real `/products/`
  response returned using purely DB-sourced credentials/config, all four
  target env vars unset.
- Full `server.ts` boot smoke test — boots and serves `/api/health`.
