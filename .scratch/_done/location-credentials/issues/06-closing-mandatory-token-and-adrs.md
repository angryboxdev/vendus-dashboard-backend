# 06 — Closing: mandatory token, remove fallback, ADR-0010 + amend ADR-0009, smoke test

**What to build:** The transition state stops being the permanent state.

- `requireDeviceAuth` stops falling back to `UNATTENDED_SCOPE` for kiosk,
  till-closing and KDS specifically — a request to any of the three with no valid
  token is rejected outright. `UNATTENDED_SCOPE` itself is untouched and keeps serving
  the crons until spec C retires it for them.
- **ADR-0010** is written, recording the location-credentials module: per-Location
  tokens, the pairing flow, and the expand-and-contract rollout (the design decisions
  from ticket 01's module, D4–D7 and D12 in the spec).
- **ADR-0009 is amended** (not superseded) to note that its unattended-scope
  mechanism is superseded for kiosk, till-closing and KDS specifically — not for the
  crons.
- A written pairing-and-revocation smoke test against the local stack proves the
  end-to-end claim reproducibly for whoever reads it next.
- The deferred register's "device identity" row is retired and replaced by two
  precise rows: this spec (location credentials for kiosk/till/KDS) and spec C
  (per-organization credentials, cron fan-out) — see the spec's own Further Notes
  table.

Do this only once ticket 05 has actually shipped and real screens have been paired by
hand during the rollout window — reversing this order makes the cutover an outage on
every live kiosk, till and KDS screen in production.

**Blocked by:** 05

**Status:** done and verified

- [x] A request to kiosk, till-closing or KDS with no token, an unknown token, or a
      revoked token is rejected — the `UNATTENDED_SCOPE` fallback is gone for these
      three consumers.
- [x] Crons still use `UNATTENDED_SCOPE` unchanged — this ticket does not touch them.
- [x] `docs/adr/0010-*.md` is written, covering the module's design decisions.
- [x] `docs/adr/0009-*.md` is amended with a note that it's superseded for
      kiosk/till/KDS specifically, not for the crons.
- [x] A written smoke test (checked into the repo, in the manner of B1's token-hook
      verification and B2's two-organization smoke) covers: a screen pairs, then
      successfully calls kiosk, till-closing and KDS with the same token; the same
      token is rejected by a different organization's equivalent endpoints; revoking
      the token causes all three endpoint groups to reject it immediately; the KDS
      stream's query-parameter token behaves identically to the header form. Run for
      real against the local stack — findings below.
- [x] The deferred register is updated: the old "device identity" line is replaced by
      the two precise rows (this spec; spec C) from the spec's Further Notes table.

## Comments

### Implementation

`createDeviceAuthMiddleware` (`src/middleware/device-auth-middleware.ts`) no longer
takes an `unattendedScope` dependency at all — the factory's only collaborator is
`lookupToken` now. A missing token, an unknown token and a revoked token all reach
`resolveDeviceAuth` and come back `{ status: "rejected" }`, which both
`requireDeviceAuth` and `requireDeviceAuthAllowingQueryParam` turn into a `401`, with
nothing left to special-case. This needed no per-consumer parameterization
(`allowUnattendedFallback` or similar) because `requireDeviceAuth`/
`requireDeviceAuthAllowingQueryParam` turned out to have exactly three consumers —
kiosk (`hrKioskRoutes.ts`), cash-closings' public router, and KDS — and no fourth.
Crons never went through this middleware to begin with:
`internalCronRoutes.ts` builds `UNATTENDED_SCOPE` directly, so they're untouched by
construction, not by a conditional.

### A pre-existing routing bug the smoke test caught live

Running the smoke test against the local stack surfaced a real, previously-invisible
bug: `cash-closing.controller.ts`'s public router did
`this.publicRouter.use(requireDeviceAuth)` with **no path**, but that router is
mounted at the bare `/api` prefix in `server.ts` (`app.use("/api",
cashClosingsModule.publicRouter)`) — the same mount point every other module's
router shares. A path-less `.use()` on an Express router applies to **every**
request that reaches that router, whether or not any route inside it matches. While
the fallback always called `next()` unconditionally, this was harmless — every
`/api/*` request just picked up a populated (and ignored) `req.deviceAuth` and moved
on. The moment the fallback was removed, this same middleware started actually
rejecting, and it rejected **every unauthenticated-looking `/api/*` request in the
whole app**, not just the three intended consumers — confirmed live: `GET
/api/locations` and `GET /api/financial-base/cost-centers`, called with a perfectly
valid admin JWT and no device token, both came back `401 {"error":"Invalid or
missing device credentials"}` before this was fixed.

Fixed by scoping the mount: `this.publicRouter.use("/cash-closings",
requireDeviceAuth)`. Every route on this router is already defined under
`/cash-closings/...`, so this changes nothing about which of *this module's* routes
require the token — verified `POST /api/cash-closings/verify-pin` with no token
still returns `401` after the fix — while no longer intercepting requests bound for
any other module. KDS and location-credentials were never at risk: both already
apply `requireDeviceAuth`/`requireDeviceAuthAllowingQueryParam` per-route, not as a
router-level `.use()`. Flagging this clearly: **this bug would have been a
same-day, whole-API outage in production** if ticket 06 had shipped without it — the
fallback was the only thing masking it, on every request, since the routers were
first laid out this way. Fixed as part of this ticket rather than filed separately,
since it's inseparable from "does removing the fallback actually work."

### The smoke test, run for real against the local stack

The local stack (`supabase start`, already running — Postgres, GoTrue, PostgREST,
Kong on the default `127.0.0.1:5432x` ports) already carried this ticket's schema
(`location_tokens`, `pairing_codes` with the `description` column from the
`20260906120000` migration). It had no seeded `auth.users` / `org_members` at all,
so provisioning was hand-rolled for this run rather than via the interactive
`org:provision:dev` script:

- Two admin users created via GoTrue's admin API (`POST /auth/v1/admin/users`,
  service-role key), one per organization.
- A second organization + location inserted directly (Angrybox's own row,
  `b6999cff-...`/`c11d9146-...`, was already present from the baseline seed and
  untouched; the second org/location were new rows, ids
  `9a9f39b6-0dfb-4183-9731-d7e855bc3cb8` / `549118eb-fea8-4c37-b0bf-19471215e361`).
- One `org_members` row per admin, `role = 'admin'`.
- Signed in both via `POST /auth/v1/token?grant_type=password` — both access tokens
  decoded with the correct `org_id`/`org_role` claims, confirming
  `custom_access_token_hook` is wired on this stack.
- App server run with `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
  pointed at the local stack and `CRON_SECRET=smoke-test-secret`; `.env`'s own
  `SUPABASE_URL` (remote) was never touched.

**Pairing.** Each org's admin generated a pairing code for their own location
(`POST /location-credentials/pairing-codes`), and each code was redeemed exactly
once (`POST /location-credentials/redeem`) for a token — a second redemption of the
same code returned `409`, confirming single-use. Two tokens now exist, one per
organization, call them Token A (Angrybox/Arcozelo) and Token B (Segunda's org).

**The same token succeeds on kiosk, till-closing and KDS.** With Token A on
`X-Device-Token`:
- `GET /location-credentials/tokens/me` → `200 {"locationId":"c11d9146-..."}`.
- `POST /api/hr/kiosk/scan` (empty body) → `400`, a body-validation error — proving
  the request got **past** device auth into the route handler, not rejected by it.
- `POST /api/cash-closings/verify-pin` (`{"pin":"0000"}`) → `401`, but with the
  domain message `"PIN inválido ou funcionário inativo"` (`InvalidPinError`), not
  device-auth's `"Invalid or missing device credentials"` — distinguishable by
  message, confirming the token was accepted and the request reached
  `VerifyPinUseCase`.
- `PATCH /api/kds/air-menu-deliveries/999999/status` → `404 {"error":"Order not
  found"}` — again past auth, into KDS's in-memory store lookup.
Repeated with Token B against the same three endpoint groups: `tokens/me` resolved
`{"locationId":"549118eb-..."}` (Segunda's own location, never Angrybox's), kiosk
scan returned the same body-validation `400`, and verify-pin returned the same
domain `401`.

**The same token is rejected by a different organization's equivalent endpoints.**
Kiosk, till-closing and KDS have no per-organization URL — they resolve
organization and location entirely from the token itself, so there is no separate
"org B's kiosk endpoint" to call with org A's token. The organization-boundary
surface that *is* addressed by URL is the admin API, and it held: Segunda's admin
JWT against `GET /location-credentials/locations/<Angrybox's location id>/tokens`
→ `404 {"error":"Location \"...\" does not belong to the calling
organization"}`, and symmetrically for Angrybox's admin against Segunda's location.
Angrybox's admin JWT correctly listed only Angrybox's own token when asking about
Angrybox's own location. Combined with the per-token isolation shown above (Token A
never resolves anything but Angrybox's location, Token B never resolves anything
but Segunda's, regardless of which admin is asking), this is the practical form
"rejected by a different organization" takes in a design where the device token —
not the URL — carries the organization.

**Revoking the token causes all three endpoint groups to reject it immediately.**
Angrybox's admin revoked Token A (`DELETE /location-credentials/tokens/:id` → `204`).
Immediately afterward, with no server restart and no cache to invalidate (D5:
revocation is a row delete, checked by lookup on every request): `tokens/me`,
kiosk scan, till-closing verify-pin, the KDS PATCH route, and `GET /kds/stream`
(header form) **all** returned `401 {"error":"Invalid or missing device
credentials"}` for Token A. A request with no token at all now gets the identical
`401` — the pre-ticket-06 behavior (`200` via the `UNATTENDED_SCOPE` fallback) is
gone, confirmed directly on `POST /api/hr/kiosk/scan` with no token header.

**The KDS stream's query-parameter token behaves identically to the header form.**
With Token B (still valid): `GET /kds/stream` with `X-Device-Token: <token B>`
and `GET /kds/stream?device_token=<token B>` both returned the identical
`event: connected\ndata: {}` opening frame. With no token in either form, or an
unknown token via the query parameter, both returned the same `401` body as the
header form's rejection.

**Cleanup.** Every row created for this run — both `location_tokens`,
both `pairing_codes`, both `org_members` rows, the second organization and its
location, and both GoTrue users — was deleted afterward. Re-checked: `organizations`
and `locations` are back to exactly the one Angrybox row each, `location_tokens`/
`pairing_codes`/`auth.users` are back to zero rows. Angrybox's pre-existing data was
never touched.

### Full test suite and lint

`npm run test` — 155 suites, 1320 tests, all passing. `npm run typecheck` — clean.
`npm run lint:deps` (`depcruise src --config .dependency-cruiser.cjs`) — "no
dependency violations found" (717 modules, 2639 dependencies cruised).
