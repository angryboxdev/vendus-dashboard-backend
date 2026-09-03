# 05 — Front end: admin pairing UI, unpaired-screen redemption form

**What to build:** *(Lives in the frontend repo — see CLAUDE.md's cross-repository
contract-sync rule. Ticket tracked here because the spec makes it a required, blocking
increment, not a separately-tracked, undated dependency.)*

- An org admin can generate a pairing code for one of their organization's locations
  from a screen in the admin UI, see the code, and know it's short-lived and
  single-use.
- An unpaired kiosk/till/KDS screen presents a redemption form; entering a valid code
  pairs the screen and persists the resulting token so the setup is never repeated for
  that screen.
- After pairing once, kiosk, till-closing and KDS all work on the same physical
  tablet — no per-feature re-pairing (a token authorizes a Location, not a feature).

This ticket exists specifically so the closing increment (06) doesn't ship the
mandatory-token cutover before any real screen is capable of pairing — that sequencing
mistake would turn deployment into an outage on every live kiosk, till and KDS screen.

**Blocked by:** 02, 03, 04

**Status:** ready-for-agent

- [ ] Admin can generate a pairing code for a chosen location and see it displayed.
- [ ] An unpaired screen can redeem a code via a form and thereafter stays paired
      (token persisted, setup not repeated).
- [ ] One pairing on one tablet works across kiosk, till-closing and KDS without
      re-pairing per feature.
- [ ] Back/front contract for the three new/changed endpoints (generate pairing code,
      list/revoke tokens, redeem code) matches what tickets 01–04 actually shipped;
      flag and resolve any drift in the same task, per CLAUDE.md.
