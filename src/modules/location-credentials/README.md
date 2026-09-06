# Module: location-credentials

> Status: active
> Last updated: 2026-09-06

---

## What it is and what it's for (business perspective)

Three physical screens — the kiosk, the till-closing screen and the kitchen
display (KDS) — sit in a restaurant with no way to prove which organization
or which store ("Location") they belong to. Today they all trust one
hardcoded constant (`UNATTENDED_SCOPE`). That's safe only while a single
organization exists: the moment a second one is provisioned, every unpaired
screen in existence — old tenant's and new tenant's alike — would resolve to
the same organization.

**The problem it solves:**
Without a real credential, pairing a new tablet means trusting a shared,
hardcoded scope instead of proving "this screen belongs to Location X of
Organization Y." An admin needs a way to bring a screen online that scopes
it correctly, and to take that access away again if the tablet is lost.

**The flow from the business's point of view:**

```
Org admin (frontend)                 Unpaired screen (kiosk/till/KDS)
──────────────────────────────      ──────────────────────────────
1. Picks a Location
2. Generates a pairing code     →   3. Employee types the code in
                                     4. Screen redeems it, gets a token
                                     5. Every request after this carries
                                        the token — screen is "paired"
6. Sees the screen's token in
   the active-tokens list
7. Revokes it if the tablet
   is lost or stolen              →  8. That screen's next request fails
```

**Key concepts for the business:**

- **Pairing Code** — a short code an admin generates for one Location. An
  employee types it into an unpaired screen once. It expires within minutes
  and can only be used once, successfully or not.
- **Location Token** — the credential a screen keeps after redeeming a
  pairing code. It's what proves "I belong to this Location" on every
  request from then on. An admin can revoke it at any time.

---

## Technical purpose

Owns the whole pairing-and-credential mechanism end to end: an admin mints a
pairing code for a Location they own; an unpaired caller redeems it exactly
once for an opaque token; a new `requireDeviceAuth` middleware
(`src/middleware/device-auth*.ts`) validates that token on later requests and
resolves the same organization/location shape `requireAuth` already
provides for a logged-in user. This module does **not** decide which
consumer routes require a device token — that's tickets 02-04 (kiosk,
till-closing, KDS specifically) — and it does not model a physical device;
see "No Device entity" below.

## Domain concepts

- **PairingCode** — `id`, `organizationId`, `locationId`, `code`,
  `expiresAt`, `burnedAt`, `description`. Invariant: `burn()` is called on
  the **first redemption attempt**, whether that attempt succeeds or the
  caller never receives the response — a second attempt against the same
  code always finds it burned, even if the first attempt actually failed for
  some other reason (e.g. expiry). `isExpired(now)` and `burn(now)` are
  separate calls so the use case can burn before it checks expiry (spec.md
  D6). `description` is an optional, nullable, write-once free-text label
  set by the admin at generation time (ticket 07) — see "No Device entity"
  below for what it is not.
- **LocationToken** — `id`, `organizationId`, `locationId`, `tokenHash`,
  `issuedAt`, `description`. Holds only the SHA-256 hash of the raw token —
  the raw value is minted and returned exactly once, by
  `RedeemPairingCodeUseCase`, and is never reconstructed from this entity or
  logged anywhere. Authorizes one Location, not a feature (spec.md D8) —
  nothing on this entity says which of kiosk/till/KDS it was paired "for."
  `description` is copied from the `PairingCode` at redemption time (ticket
  07) — it is the same opaque label, not a new piece of identity.

### No Device entity (spec.md D3, story 33)

There is deliberately no `Device` row anywhere in this module. A
`LocationToken` proves "this caller is paired to Location X" and nothing
about which physical screen it is — a manager legitimately running kiosk,
till and KDS on the same tablet is the normal case (spec.md D8), so naming
individual devices would model something this design has no use for.
`ListActiveTokensUseCase` returns issue dates only, never a device name.
**If a future request asks for "per-device names" or "which screen is
this,"** that is a new domain concept, not a gap in this one — it needs its
own design, informed by this decision, not a field bolted onto
`LocationToken`.

**`description` (ticket 07) is not that Device entity.** An admin can
attach a free-text label (e.g. "Kitchen monitor") when generating a pairing
code, carried onto the resulting `LocationToken` so a later listing says
which physical device a token is for — but it is a plain opaque string with
no identity or lookup semantics: it cannot be used to look anything up, it
is not unique, and nothing in this module branches on its value. It exists
purely as a carrier between two separate requests (generation, then
redemption, possibly minutes apart and by a different actor) — there is no
other channel for that value to reach the token. It is also write-once: no
update/rename endpoint, so fixing a typo means revoking and re-pairing. A
future "which screen is this, actually identify it" request is still the
new domain concept described above, unaddressed by this field.

## Ports

### Input (use cases)

- `GeneratePairingCodePort` — mints a pairing code for one of the caller's
  organization's Locations. Confirms ownership via `locations`' own
  `LocationRepositoryPort.findOneForOrganization` (spec.md D11/D19) rather
  than re-implementing that check; throws `LocationNotOwnedError` otherwise.
  Accepts an optional `description` (ticket 07): trimmed, 1-100 chars if
  present, throws `InvalidDescriptionError` if it's whitespace-only or too
  long; omitted stores `null`.
- `RedeemPairingCodePort` — redeems a code for a raw token. No caller
  identity is required — this is how an unpaired screen gets its first
  credential. Throws `PairingCodeNotFoundError`, `PairingCodeAlreadyUsedError`
  or `PairingCodeExpiredError`; the code is burned before any of these is
  decided (see PairingCode above). Copies the pairing code's `description`
  onto the minted `LocationToken` (ticket 07).
- `ListActiveTokensPort` — lists a Location's active tokens (`id`,
  `issuedAt`, `locationName`, `description`). Confirms ownership via `locations`'
  `LocationRepositoryPort.findOneForOrganization` the same way
  `GeneratePairingCodePort` does, throwing `LocationNotOwnedError`
  otherwise — `locationName` comes from that same lookup, not from
  `LocationToken` itself (D3, see "No Device entity" above).
- `RevokeTokenPort` — deletes one token by id, scoped to the caller's
  organization. Idempotent: revoking an id that doesn't exist (or already
  belongs to someone else) is not an error.

### Output (domain dependencies)

- `PairingCodeRepositoryPort` — `save`, `findByCode`. `findByCode` is
  looked up by value alone, with no organization filter — see "Integration
  test approach" below for why its adapter can't build that query through
  `ScopedQuery`.
- `LocationTokenRepositoryPort` — `save`, `listByLocation(organizationId,
  locationId)`, `deleteById(organizationId, tokenId)`. Every call here
  already knows the organization, so its adapter uses `ScopedQuery`
  throughout.
- `LocationRepositoryPort` (from `locations`, not owned here) —
  `findOneForOrganization`, added to that module by this one (spec.md
  D11/D19); see `locations/README.md`.

## Adapters

### Input

- `LocationCredentialController` → two routers, mirroring
  `cash-closing.controller.ts`'s shape:
  - `adminRouter`, behind `requireAuth` + `requireMinRole("admin")`:
    - `POST /location-credentials/pairing-codes` — generate
    - `GET /location-credentials/locations/:locationId/tokens` — list
    - `DELETE /location-credentials/tokens/:tokenId` — revoke
  - `deviceRouter`, no user auth (no `requireAuth`/`requireMinRole`
    anywhere on it) — but not uniformly unauthenticated: each route sets
    its own device-facing gate per-route, individually:
    - `POST /location-credentials/redeem` — redeem a code for a token. No
      auth at all — an unpaired screen has no credential yet, that's the
      whole point.
    - `GET /location-credentials/tokens/me` — behind `requireDeviceAuth`.
      A paired screen's own revalidation check: "is the token I already
      have still good?" (frontend `DevicePairingGate`, closes the bug where
      "token present in localStorage" was treated as "still paired" with no
      server round-trip). Returns `200 { locationId: string }` — the
      `locationId` `requireDeviceAuth` itself resolved — on a valid token;
      the middleware rejects with `401` before this handler ever runs for a
      missing/unknown/revoked token, identically (see "Tokens are deleted,
      not marked revoked" below) — **except** a request that carries no
      token at all, which still gets `200` via `requireDeviceAuth`'s
      `UNATTENDED_SCOPE` fallback (see that section below) — this route
      does not change that behavior, it inherited it. No new use case/port:
      `requireDeviceAuth` already does 100% of the validation this route
      needs (DB-backed hash lookup, not just decoding a token's shape), so
      the handler is a thin pass-through with no domain decision left to
      make — adding a `CheckDeviceTokenUseCase` would just re-wrap a read of
      something already proven, unlike `ListActiveTokensUseCase`'s use case,
      which actually queries a repository this port doesn't need to.
  - **Mounted in `server.ts`** (`app.use("/api", locationCredentialsModule.deviceRouter)`
    before the global `requireAuth`, and `app.use("/api", locationCredentialsModule.adminRouter)`
    after it) — effectively `/api/location-credentials/...`.

### Output

- `SupabasePairingCodeRepository` → `pairing_codes` table. `save` goes
  through `ScopedQuery` (the organization is always already known at that
  point); `findByCode` goes through the named unscoped door
  `src/infra/scoped-db/pairing-code-lookup.ts` instead, because redemption
  has no organization to scope by yet.
- `SupabaseLocationTokenRepository` → `location_tokens` table, entirely
  through `ScopedQuery` — every operation here already has an organization.
- `requireDeviceAuth` (`src/middleware/device-auth.ts`, wiring around
  `src/middleware/device-auth-middleware.ts`) → validates a token via its
  own unscoped door, `src/infra/scoped-db/device-token-lookup.ts` (a device
  token, like a pairing code, has no organization to scope a lookup by until
  the lookup itself returns one).

## Design decisions (ADR summary)

### Two named "unscoped doors," not a general escape hatch

`ScopedQuery` can only be constructed from a known organization
(`src/infra/scoped-db/scoped-query.ts`), and this module has exactly two
places that must look something up **before** an organization is known: a
pairing code by its code value, and a device token by its hash. Both follow
the existing precedent set by `src/infra/scoped-db/membership-lookup.ts`
(spec B2 D5/D10) — one small, named, unscoped function per genuine need,
living inside `src/infra/scoped-db/` (the only folder allowed to import
`@supabase/supabase-js`, per the `supabase-so-no-scoped-db`
dependency-cruiser rule), rather than a raw client anywhere in this module's
own adapters. `pairing-code-lookup.ts` is consumed only by
`SupabasePairingCodeRepository.findByCode`; `device-token-lookup.ts` is
consumed only by `requireDeviceAuth`'s wiring — adding a third unscoped need
anywhere in this codebase means adding a third named function next to these
two, not loosening either of them into a general query surface.

### Tokens are deleted, not marked revoked

Revoking a screen is a plain `DELETE` on its `location_tokens` row — no
`revoked_at` column, no blocklist. A missing row and a revoked row are
therefore the same thing to `requireDeviceAuth`: this is what makes
"missing/unknown/revoked all rejected identically" true by construction
(story 35) rather than a rule every check has to remember, and it's why
revoking one token can never touch a sibling row at the same Location (D4) —
there is no shared state between rows to accidentally disturb.

### `requireDeviceAuth`'s `UNATTENDED_SCOPE` fallback is temporary scaffolding

When no token is present on a request **at all**, `requireDeviceAuth`
currently falls back to populating `req.deviceAuth` from `UNATTENDED_SCOPE`
instead of rejecting. This is deliberate, ticket-01-only scaffolding
(spec.md D12, "expand-and-contract"): nothing consumes this middleware yet,
and Angrybox's live kiosk/till/KDS screens must keep working, unpaired,
while this module ships and while the front-end pairing UI (ticket 05) is
built. **Ticket 06 deletes this fallback for kiosk, till-closing and KDS
specifically** — making the token mandatory for those three consumers.
`UNATTENDED_SCOPE` itself is untouched by that removal: it remains the
crons' mechanism, and stays that way until spec C retires it for them (spec
C is a different piece of work — see spec.md D1). A present-but-unresolvable
token (missing/unknown/revoked) is **never** covered by this fallback — only
a request carrying no token at all is; see `resolveDeviceAuth` above for why
those three still collapse into one outcome.

### The KDS SSE query-parameter transport is a deliberate exception, not an inconsistency

`requireDeviceAuth` only reads the token from the `X-Device-Token` header.
`requireDeviceAuthAllowingQueryParam` additionally reads a `device_token`
query parameter, and exists **only** for KDS's `GET /kds/stream` — browsers'
native `EventSource` cannot set custom headers (spec.md D7/story 23). It is
built and unit-tested here but **not wired into any route in this ticket** —
that's ticket 04's job. Do not read the existence of
`requireDeviceAuthAllowingQueryParam` as license to accept a token via query
string anywhere else; every other route uses the header-only
`requireDeviceAuth`.

### Integration-test approach

There is no existing adapter-integration-test file anywhere in this repo to
copy (`tasks`' Postgres adapter is an unimplemented stub; neither `locations`
nor `cash-closings` has one). This module's
`__tests__/integration/supabase-location-credentials.integration.test.ts` is
the first: it builds its own `@supabase/supabase-js` client pointed at the
**local** Supabase stack (`supabase start`) — not at `ENV`/`.env`, which in
this repo currently points at a remote project — using the Supabase CLI's
fixed local "demo" credentials as the default (identical on every machine
running the stack locally; overridable via `TEST_SUPABASE_URL`/
`TEST_SUPABASE_SERVICE_ROLE_KEY`). Since `getSupabaseServiceRole()`
(`src/infra/scoped-db/supabase-client.ts`) resolves its client from `ENV`
with no injection point — matching every other consumer in the codebase —
the test `jest.mock`s that one file to hand back the local client instead,
and imports everything under test dynamically inside `beforeAll`, after
that mock is registered (a static top-level `import` would `require` the
real module first). It seeds against Angrybox's fixed org/location ids
(`src/infra/scoped-db/unattended-scope.ts`), guaranteed present after
`supabase db reset`, rather than provisioning a fresh organization (a
different module's job), and deletes every row it creates in `afterEach` so
it's safe to re-run. `beforeAll` fails loudly if the local stack isn't
reachable — a real failure to fix (`supabase start`), not a condition to
skip over quietly, matching spec.md D15's "no dedicated Supabase
integration harness" call: this is the same discipline every other adapter
test in this repo would use, applied to the first module that actually
needed one.

### Pairing codes are stored in plain text, tokens are stored hashed

A pairing code is short-lived (minutes), single-use, and the admin who
generates it already sees it in plain text on the response — hashing it
would add a lookup-by-hash step for no additional exposure window. A
`LocationToken`, by contrast, is long-lived and the only thing that stands
between a stolen value and standing access to a Location — so it is never
stored as anything but a SHA-256 hash (`createHash("sha256")`, no server
secret — spec.md D5 explicitly rejects an HMAC/JWT-style self-contained
token, since that can't be revoked before it expires without adding a
blocklist).

## How to test

- Domain/use cases: `npx jest --config jest.config.cjs --testPathPattern=src/modules/location-credentials/__tests__/(domain|use-cases)` (fast, fakes only, no database).
- `requireDeviceAuth`: `npx jest --config jest.config.cjs --testPathPattern=src/middleware/__tests__/device-auth`.
- Adapter integration test (needs `supabase start`, then `supabase db reset` at least once to apply this ticket's migration): `npx jest --config jest.config.cjs --testPathPattern=src/modules/location-credentials/__tests__/integration`.
- All of this module: `npx jest --config jest.config.cjs --testPathPattern=src/modules/location-credentials`.
- Lint de fronteiras: `npx depcruise src/modules/location-credentials --config .dependency-cruiser.cjs`.

## Known gaps / open debt

- `RedeemPairingCodeUseCase`'s burn-then-check-expiry sequence is two
  separate repository calls (`findByCode` then `save`), not one atomic
  conditional update — two simultaneous redemption attempts against the
  same code both racing before either write lands could, in principle, both
  read "not yet burned." Given the code is entered by hand on one screen at
  a time, this is a low-likelihood window, not addressed in this ticket.
- `requireDeviceAuthAllowingQueryParam` is untested against a real Express
  route (only via the same hand-constructed fake `req`/`res` as the header
  form) — ticket 04, which actually mounts it on `GET /kds/stream`, is
  where that gets exercised against the real KDS route.
- `GET /location-credentials/tokens/me` returns `200` for a request with
  **no** device token at all, not `401` — it inherits `requireDeviceAuth`'s
  `UNATTENDED_SCOPE` fallback (see above), which this ticket did not
  change. A caller that wants "definitely paired, and I can prove it" from
  this endpoint needs that fallback gone first — that's ticket 06's job for
  kiosk/till-closing/KDS specifically; this route was not in that list and
  still gets the fallback. `LocationToken` also has no expiry field at all
  (only `PairingCode` expires) — "expired" is not a state this endpoint (or
  `requireDeviceAuth`) can ever return; the only two outcomes are "valid" or
  "missing/unknown/revoked," collapsed identically into `401` (or `200`
  unattended, for a wholly absent token).
