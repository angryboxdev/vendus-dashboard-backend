# 02 — QR-encoded kiosk URL carries the paired device token

**What to build:** The kiosk's QR code URL gains the tablet's own paired
device token (already held in the tablet's `localStorage` from pairing) as
a query parameter, so a `POST /kiosk/scan` triggered by *any* device that
scans the QR — the paired tablet or an employee's own phone — presents a
real device credential instead of relying on the scanning device's own
(virtually always empty) `localStorage`. A scan with the token attached
succeeds exactly as today; a scan with none attached still 401s.

Decide and document the transport (DA3): either widen the backend to accept
`requireDeviceAuthAllowingQueryParam` on this route (needs deliberate
sign-off — this widens query-string device-token transport beyond its one
existing KDS exception), or keep `POST /kiosk/scan` header-only and have
`KioskCheckinPage` read the token from the URL and attach it as an ordinary
`X-Device-Token` header itself. See
`.scratch/kiosk-pin-storage-prefix/spec.md` Section A (DA2, DA3, Risks) for
the full tradeoff — the spec leans toward the frontend-attaches option but
leaves the call to whoever implements this.

No new credential type and no change to `GET /kiosk/daily-token`'s payload
shape (it stays scope-agnostic).

**Blocked by:** None — can start immediately. Independent of ticket 01.

**Status:** done, verified

- [x] Kiosk QR URL includes the paired device token as a query parameter.
- [x] `KioskCheckinPage` reads the token and presents it on `POST
      /kiosk/scan` (via whichever DA3 transport is chosen).
- [x] The DA3 transport decision is written down explicitly (ticket
      comments or ADR), not left as a silent one-line diff.
- [x] A scan with the device token attached via the new URL-carried path
      succeeds; a scan with no token attached still 401s.
- [x] No change to `GET /kiosk/daily-token` or `POST /kiosk/scan`'s request/
      response body shapes.
- [x] Frontend change lands in this same ticket (this repo's `CLAUDE.md`
      cross-repo rule) — frontend repo:
      `/Users/viniciusbazanella/projects/vendus-dashboard-frontend`.

## Comments

### DA3 decision: option (b) — header-only backend, frontend reads-and-reattaches

Going with spec.md's leaning: `POST /kiosk/scan` stays `requireDeviceAuth`
(header-only). No backend widening of `requireDeviceAuthAllowingQueryParam`
to this route.

- `KioskDisplayPage` adds the tablet's own paired device token (already in
  `localStorage`, key `angrybox.deviceToken`) as a query parameter on the QR
  URL, alongside the existing `date`/`token` daily-HMAC pair.
- `KioskCheckinPage` reads that query parameter and attaches it itself as an
  ordinary `X-Device-Token` header on its own `POST /kiosk/scan` call —
  distinct from the shared `deviceFetch`/`localStorage` path every other
  device-auth consumer uses, because the checkin page must not depend on its
  *own* `localStorage` (per DA2/DA3's whole premise: the scanning device is
  usually not the paired tablet).

Reasons, matching spec.md DA3:
1. Costs nothing on the backend; no widening of query-string device-token
   transport beyond the one existing KDS exception
   (`requireDeviceAuthAllowingQueryParam`), which `device-auth-middleware.ts`'s
   own comment says is a deliberate, narrow exception — reusing it here would
   need the same kind of sign-off D7 gave KDS, and there's no such sign-off
   requested for this ticket.
2. Doesn't reopen a decision `location-credentials` (D7) closed on purpose.
3. The cost — `KioskCheckinPage` needs its own device-token-from-URL wiring
   instead of reusing `deviceFetch` — is small and confined to one page.

Rejected: option (a) (widen `requireDeviceAuthAllowingQueryParam` to
`POST /kiosk/scan`). Would silently widen query-string device-token transport
beyond KDS without the deliberate sign-off `device-auth-middleware.ts`'s
comment asks for — exactly the risk spec.md's Risks table names. No such
sign-off was requested or given for this ticket, so it's off the table.

### Implementation notes

**Backend** (`vendus-dashboard-backend`) — no transport change, as DA3(b)
requires. `POST /kiosk/scan` (`src/routes/hrKioskRoutes.ts`) stays on
`requireDeviceAuth`, header-only; `requireDeviceAuthAllowingQueryParam` stays
un-wired to this route. Added the controller-level test that didn't exist
yet (`src/routes/__tests__/hrKioskRoutes.test.ts`): valid `X-Device-Token`
header succeeds, no header 401s, invalid token 401s, and a token passed only
as a `?device_token=` query param still 401s (proves no accidental
query-param fallback slipped in). Also added `.unref()` to
`hrKioskRoutes.ts`'s module-level rate-limit cleanup `setInterval` — an
unrelated latent issue (kept the process alive forever) that only surfaced
once a test finally imported the route file directly.

Re-confirmed the already-closed lookup-scoping half of gate item 5 with
regression tests: `src/modules/cash-closings/__tests__/adapters/supabase-employee.repository.test.ts`
and `src/services/__tests__/hrEmployeeService.test.ts` assert `org_id` is
filtered before the `kiosk_pin_hash` predicate in both
`findActiveByPinHash` and `findActiveEmployeeByPinHash`.

`npm run typecheck` clean; the three new/touched test files pass (3 suites,
6 tests).

**Frontend** (`vendus-dashboard-frontend`) — read that repo's own CLAUDE.md
and reference module (`src/modules/tasks`) first; confirmed via the
`location-credentials` module README that `KioskDisplayPage.tsx` /
`KioskCheckinPage.tsx` / `hrApi.ts`'s `kioskScan` are a documented legacy
seam (plain function imports, not the hexagonal DI path) because migrating
them means migrating those whole pages — out of scope here, so the change
follows that existing pattern rather than migrating anything.

- `src/pages/kiosk/KioskDisplayPage.tsx` — reads the tablet's own paired
  token via `getStoredDeviceToken()` (`local-storage-device-token.adapter.ts`,
  same import style `KdsPage.tsx` already uses) and appends it to the QR
  checkin URL as `deviceToken=<encoded>`; omitted entirely when the tablet
  is unpaired (existing QR behavior unchanged in that case).
- `src/pages/hr/hrApi.ts` — `kioskScan` takes an optional `deviceToken`; when
  present it does a plain `fetch` with `X-Device-Token` set explicitly from
  it (bypassing `deviceFetch`/localStorage); when absent, unchanged.
- `src/pages/kiosk/KioskCheckinPage.tsx` — reads `deviceToken` from its own
  URL's search params and forwards it to `kioskScan`.
- `src/modules/location-credentials/README.md` — updated legacy-seam
  consumer list and design-decision notes for the new `deviceToken`
  QR-to-header transport.

No change to `GET /kiosk/daily-token` or `POST /kiosk/scan` body shapes —
only the header's source for this one call. `npx tsc -b` clean; lint clean
(one pre-existing, unrelated `react-hooks` warning confirmed via `git
stash`); `vitest run src/modules/location-credentials` 36/36 pass. No
existing test convention for `src/pages/hr`/`src/pages/kiosk` — matches
spec.md's note that manual verification is the norm here; manual
verification steps written up above are: QR unchanged when unpaired: QR
carries `deviceToken` once paired; a second, unpaired device scanning the
QR successfully completes `POST /kiosk/scan` with `X-Device-Token` sourced
from the URL param, visible in the network tab.

Not committed in either repo, per this ticket's implementation instructions.
