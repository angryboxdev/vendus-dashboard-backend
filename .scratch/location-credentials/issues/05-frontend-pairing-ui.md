# 05 — Front end: admin pairing UI, unpaired-screen redemption form

**What to build:** *(Lives in the frontend repo — see CLAUDE.md's cross-repository
contract-sync rule. Ticket tracked here because the spec makes it a required, blocking
increment, not a separately-tracked, undated dependency.)*

- An org admin can generate a pairing code for a chosen location and see it displayed,
  short-lived and single-use.
- Build a page listing every location and its currently active tokens, with a
  per-token revoke action (revoking one has no effect on siblings at the same
  location, per ticket 01). That same page is the entry point to generate a new
  pairing code.
- An unpaired kiosk/till/KDS screen presents a redemption form; entering a valid code
  pairs the screen and persists the resulting token so the setup is never repeated for
  that screen. The three unpaired screens share one pairing page/component — not
  three separate implementations.
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
- [ ] Kiosk, till and KDS unpaired-redemption forms are the same shared page/component.
- [ ] Admin can view all active tokens per location, revoke any one individually
      without affecting others at the same location, and reach code generation from
      that same page.
- [ ] Back/front contract for the three new/changed endpoints (generate pairing code,
      list/revoke tokens, redeem code) matches what tickets 01–04 actually shipped;
      flag and resolve any drift in the same task, per CLAUDE.md.

**Manual tests - results**

The following issues were found when manually testing the ticket.
I'm not sure these are this ticket's scope - if not, that's fine.

- On an unpaired device, the `/kiosk` page doesn't show the token gate. `/fecho` and `/kds` pages show it, as expected.
- After pairing a device, whenever I go back to `/admin/location-tokens` page, I still see an empty list. I expected to see a table showing information about the device/location I just paired.
- Minor issue: After generating a new pairing code, if I reload the page, the code goes away. Since it takes 10min to expire, it would be nice to keep showing the pairing code until it expires. I assume we can retrieve the pairing code from the DB. If not possible to get the code once it's generated, then we can adjust the UI saying something like "This code won't appear again after you leave this page."
- By testing it, I got confused by something: Once the admin generates a pairing code, how do we know which location that code is for? I wasn't asked to select a location or anything - is that just because we currently have a single location? How would it behave in a organization with multiple locations?