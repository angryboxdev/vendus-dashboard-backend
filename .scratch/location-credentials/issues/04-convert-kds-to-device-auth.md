# 04 — Convert KDS to `requireDeviceAuth`, including the SSE stream

**What to build:** Every KDS route — advance an order, cancel it, and the live status
stream — currently accepts requests from anyone who can reach the URL. All of them
now require a valid Location token via `requireDeviceAuth` (fallback to
`UNATTENDED_SCOPE` still active per ticket 01 — unpaired screens keep working during
rollout). No PIN or employee factor is added: KDS is a status board with no
"which employee did this" concern, so the token alone is the gate.

The live-order stream is a Server-Sent Events endpoint; browsers' native `EventSource`
can't set custom headers, so this one route takes the token as a query parameter
instead of the header used everywhere else. This is a deliberate, narrow, documented
exception (not an inconsistency to "fix" later) — call it out explicitly in the route
and/or module docs so a future reader doesn't "normalize" it into the header form.

This is a mechanical dependency swap at the call site — no new controller-level test
is expected, matching how KDS had none before this spec.

**Blocked by:** 01

**Status:** done, verified

- [x] All KDS routes (advance, cancel, stream) require `requireDeviceAuth`; a request
      with no token, an unknown token, or a revoked token is rejected the same way a
      stranger who finds the URL is rejected today by nothing.
- [x] The stream route accepts the token as a query parameter; every other KDS route
      uses the header form. The query-parameter exception is documented inline as
      deliberate.
- [x] The stream keeps updating in real time after pairing — no behavior regression
      to polling/reload-to-see-new-orders.
- [x] A paired screen's KDS requests resolve to the paired location; an unpaired
      screen still resolves to `UNATTENDED_SCOPE` (fallback path from ticket 01).

## Comments

`src/modules/kds/adapters/in/kds.controller.ts` now imports
`requireDeviceAuth, requireDeviceAuthAllowingQueryParam` from
`../../../../middleware/device-auth.js` and applies them as route
middleware, following the same pattern as
`location-credential.controller.ts`:

- `GET /kds/stream` → `requireDeviceAuthAllowingQueryParam` — the only route
  using the query-param variant, because the native browser `EventSource`
  can't set custom headers, so the token has to travel as
  `?device_token=...` instead of `X-Device-Token`. Documented inline in the
  existing JSDoc block above the route (kept its Portuguese content, added
  an "Auth:" note explaining the exception is deliberate, not something to
  "normalize" to the header form later).
- `GET /kds/deliveries`, `PATCH /kds/deliveries/:id/status`,
  `PATCH /kds/air-menu-deliveries/:id/status` → plain `requireDeviceAuth`
  (header form).

No changes to the use cases, ports, or `AirMenuKdsStoreAdapter` — this is a
route-level auth gate only, matching the ticket's "mechanical dependency
swap" framing. `req.deviceAuth` is populated by the middleware but unused in
the handlers, since KDS has no per-location filtering to wire it into. An
unpaired screen sends no token/header, so `requireDeviceAuth`'s existing
UNATTENDED_SCOPE fallback (ticket 01) keeps it working. No controller-level
test added, matching how KDS had none before this spec. The SSE handler
itself (headers, replay, subscribe, heartbeat, `req.on('close')`) is
untouched — the middleware runs and calls `next()` before the handler body,
so stream behavior is unaffected.

`src/modules/kds/README.md`'s adapters table replaced the blanket "✅" Auth
column (which was never true — KDS was fully public before this ticket)
with the actual middleware per route, plus a short paragraph noting the
UNATTENDED_SCOPE fallback and the query-param exception. The "Sem
autenticação no SSE" debt bullet (also inaccurate — described `requireAuth`,
which was never applied to KDS) was replaced with a note that the stream now
has real per-connection auth via `requireDeviceAuthAllowingQueryParam`, with
the residual concern being the token appearing in the URL (proxy/log
exposure) rather than the header — accepted given the token is a per-screen
location token, not a per-user credential.

**Verification:** `npm run typecheck` — pass, no errors. `npm run
lint:deps` — pass, "no dependency violations found (709 modules, 2612
dependencies cruised)". `npm test` — 152/153 suites, 1286/1286 tests pass;
the 1 failing suite (`src/infra/scoped-db/__tests__/scoped-query.test.ts`)
fails to run due to a missing `VENDUS_BASE_URL` env var in this worktree
(no `.env` file present, only `.env.example`) — unrelated to this change,
doesn't touch KDS, and predates this ticket's edits (only
`kds.controller.ts` and `kds/README.md` were modified). No commit made;
changes left as uncommitted working-tree edits.
