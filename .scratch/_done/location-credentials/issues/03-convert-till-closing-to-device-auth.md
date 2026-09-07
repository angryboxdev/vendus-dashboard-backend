# 03 — Convert till-closing to `requireDeviceAuth`; fix rate-limit and PIN-reverification gaps

**What to build:** Till-closing's public endpoints (`verify-pin`, `submit`, and the
rest of the unauthenticated router) resolve organization/location via
`requireDeviceAuth` instead of `UNATTENDED_SCOPE` directly (fallback still active —
unpaired screens keep working). While this file is open for that change anyway, it
also closes the two gaps already recorded and previously declined:

- `submit` gains a per-location rate limit on repeated attempts, mirroring the
  existing per-IP rate-limit pattern kiosk's clock-in already uses.
- `submit` calls the existing `verify-pin` use case itself to check the PIN, instead
  of trusting whatever `employeeId` the client sends with no proof attached. There is
  exactly one place in the codebase that decides whether a PIN is valid, and this
  reuses it rather than duplicating the check.

From the employee's perspective, the closing flow works exactly as before, except a
PIN mismatch on submit now actually fails (it previously silently succeeded), and a
burst of submissions from the same screen past the limit is rejected.

**Blocked by:** 01

**Status:** done, verified

- [x] Till-closing resolves organization/location via `requireDeviceAuth`.
- [x] `submit` re-verifies the PIN via the existing `verify-pin` use case; a
      mismatched PIN is rejected where it previously would have been accepted on a
      bare `employeeId`.
- [x] `submit` is rate-limited per location; repeated submissions past the limit from
      the same screen are rejected.
- [x] `submit-closing`'s use-case test gains cases for both: PIN-mismatch rejection,
      and rate-limit rejection. `verify-pin`'s existing test remains the sole seam for
      PIN-checking logic itself — not duplicated here.
- [x] A paired screen's till requests resolve to the paired location; an unpaired
      screen still resolves to `UNATTENDED_SCOPE` (fallback path from ticket 01).

## Comments

`src/modules/cash-closings/adapters/in/cash-closing.controller.ts` no longer
imports `UNATTENDED_SCOPE`. `registerPublicRoutes()` now mounts
`this.publicRouter.use(requireDeviceAuth)` once, at router level, ahead of
all four public routes (`verify-pin`, `submit`, `sessions`,
`airmenu-totals`) — unlike kiosk (ticket 02), which wired
`requireDeviceAuth` per-route because it only has one public route. Each
handler now reads `req.deviceAuth!.organizationId` / `.locationId` instead
of the constant. An unpaired screen carries no `X-Device-Token`, so
`requireDeviceAuth`'s existing fallback (ticket 01) still populates
`req.deviceAuth` from `UNATTENDED_SCOPE` — unpaired behavior is unchanged.
No new controller-level test was added for this wiring, per ticket 02's
precedent (mechanical scope-source swap, not new domain logic).

**PIN re-verification — `employeeId` → `pin` in `SubmitClosingCommand`.**
`submit` no longer trusts a bare `employeeId` the client sends with no proof
attached. It now sends `pin` (validated 4-digit, same shape as
`verify-pin`), and `SubmitClosingUseCase` re-verifies it itself via the
existing `VerifyPinPort` — the exact same port `verify-pin` uses — and takes
the `{employeeId, fullName}` it returns. This let us drop
`EmployeeRepositoryPort` from `SubmitClosingUseCase`'s constructor entirely
(confirmed via grep it was only used for the now-removed
`findActiveById` lookup); `employeeRepository` is still constructed in the
composition root because `VerifyPinUseCase` needs it. `EmployeeNotFoundError`
was removed from `domain/errors.ts` — confirmed by grep it had no users
left outside this module once the lookup was gone. A mismatched PIN on
`submit` now throws `InvalidPinError` (401) instead of silently succeeding
with whatever `employeeId` the client claimed — this is a **breaking change
to the public request contract**: the `submit` endpoint's body no longer
accepts `employeeId`, it requires `pin` instead. **The frontend repo
(`vendus-dashboard-frontend`) is being updated in the same task by a
separate agent to match this contract change — not waited on here, just
noted per this repo's `CLAUDE.md` cross-repo contract-sync rule.**

**Rate limit — 10 attempts / 5 minutes per `locationId`, no cleanup needed.**
New port `SubmitRateLimiterPort` (`checkAndRecord(locationId): boolean`),
implemented by `InMemorySubmitRateLimiter` (in-memory `Map` keyed by
`locationId`, same fixed-window shape as kiosk's `scanRateMap`), checked as
the *first* thing in `SubmitClosingUseCase.execute()` — before PIN
verification, so it also throttles PIN brute-force attempts through this
endpoint, not just legitimate submission bursts. 10/5min was chosen because
legitimate submissions are ~1 per location per shift, so it's generous for
retries while still bounding PIN-guessing. Unlike kiosk's map (keyed by IP,
attacker-controlled, cleaned every 5 min via `setInterval`), this map is
keyed by `locationId`, whose cardinality is bounded to actually-paired
locations in the org — it can't grow unboundedly, so no periodic cleanup
was added. Window/limit are constructor-injectable
(`new InMemorySubmitRateLimiter(windowMs, limit)`) so the adapter test uses
a tiny window instead of faking `Date.now()`.

**Verification:** `npm run typecheck`, `npm run lint:deps`
(714 modules, 2623 dependencies, no violations), and the full `npm test`
(154 suites / 1292 tests) all pass. One test suite
(`src/infra/scoped-db/__tests__/scoped-query.test.ts`) fails to run in this
environment due to a missing `VENDUS_BASE_URL` env var — confirmed
pre-existing and unrelated to this ticket by stashing all changes and
re-running it in isolation on `main`; same failure. All 1292 tests that do
run pass, including the 4 new `submit-closing` use-case cases (PIN mismatch
with no side effect, rate-limit rejection with neither `verifyPin`
consulted nor anything saved, plus the two `InvalidPinError` tests that
replaced the old org-scoping `EmployeeNotFoundError` tests) and the 4 new
`InMemorySubmitRateLimiter` adapter tests.
