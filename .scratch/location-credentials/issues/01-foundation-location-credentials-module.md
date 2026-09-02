# 01 — Foundation: `location-credentials` module

**What to build:** A new hexagonal module that owns the whole pairing-and-credential
mechanism, end to end:

- An authenticated caller with role `admin` or above can generate a short-lived,
  single-use pairing code for one of their organization's locations (confirming
  location ownership via the `locations` module's existing output port, not a
  re-implementation of that check).
- An unpaired screen can redeem a valid, unexpired pairing code exactly once,
  receiving back an opaque, random token. The code is burned on first use whether
  redemption succeeds or the screen never completes the exchange.
- The token is stored hashed, in a new table keyed by organization and location
  (scope-by-construction, not by convention — mirrors the composite-FK discipline
  spec B2 established elsewhere).
- An admin can list a location's currently active tokens (issue dates, no per-device
  naming — there is no Device entity) and revoke one by id; revoking one token has no
  effect on any other token, even at the same location.
- A new `requireDeviceAuth` middleware validates a token from a request and populates
  a request-scoped value shaped like the existing `requireAuth` middleware's output
  (organization + location), so downstream code reads it identically regardless of
  caller kind. Token travels as a custom header on ordinary requests; a documented
  query-parameter exception exists for the KDS SSE route (built here, wired to KDS in
  ticket 04).
- A missing token, an unknown token, and a revoked token are all rejected the same
  way — indistinguishable failure modes.
- During this increment, `requireDeviceAuth` falls back to `UNATTENDED_SCOPE` when no
  token is present at all (this is what keeps every existing unpaired screen working
  while this module ships — nothing consumes this middleware yet).

No consumer route is switched over in this ticket — kiosk, till-closing and KDS still
use `UNATTENDED_SCOPE` directly until tickets 02–04. This ticket only stands the
module up and proves it end-to-end via its own tests.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Pairing-code generation, redemption, revocation and token listing are exposed as
      admin/unpaired-screen endpoints, following the reference module's adapters/in
      shape (`src/modules/tasks` is the model).
- [ ] Domain and use-case logic (issuance, redemption, revocation, validation) is
      tested against fakes, no database — the reference is `src/modules/tasks`'
      `__tests__/{domain,use-cases}` + fakes pattern.
- [ ] The new token repository adapter has an integration test, per this repo's
      normal adapter-testing rule — no new test harness invented for this module.
- [ ] `requireDeviceAuth` has its own middleware test, built the same way
      `src/middleware/__tests__/auth.test.ts` tests `resolveAuth`: pure decision logic
      exercised with hand-written fakes, no real I/O.
- [ ] Test cases at minimum: redeem-once succeeds and scopes correctly; redeem-twice
      fails; expired code fails; valid token is accepted and populates the expected
      scope; missing/unknown/revoked tokens are rejected identically; revoking one
      token doesn't affect a sibling token at the same location.
- [ ] Module ships with a `README.md` per `docs/agents/module-readme-template.md`,
      recording why there is no Device entity (a future "per-device names" request
      should be answered by this design decision, not rediscovered).
- [ ] `requireDeviceAuth`'s `UNATTENDED_SCOPE` fallback is temporary by construction —
      note in the module README that ticket 06 removes it for kiosk/till/KDS
      specifically (crons keep it; that's spec C's problem).
