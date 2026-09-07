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

**Status:** ready-for-agent

- [ ] Kiosk QR URL includes the paired device token as a query parameter.
- [ ] `KioskCheckinPage` reads the token and presents it on `POST
      /kiosk/scan` (via whichever DA3 transport is chosen).
- [ ] The DA3 transport decision is written down explicitly (ticket
      comments or ADR), not left as a silent one-line diff.
- [ ] A scan with the device token attached via the new URL-carried path
      succeeds; a scan with no token attached still 401s.
- [ ] No change to `GET /kiosk/daily-token` or `POST /kiosk/scan`'s request/
      response body shapes.
- [ ] Frontend change lands in this same ticket (this repo's `CLAUDE.md`
      cross-repo rule) — frontend repo:
      `/Users/viniciusbazanella/projects/vendus-dashboard-frontend`.
