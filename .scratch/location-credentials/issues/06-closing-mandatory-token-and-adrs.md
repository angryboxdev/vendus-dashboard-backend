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

**Status:** ready-for-agent

- [ ] A request to kiosk, till-closing or KDS with no token, an unknown token, or a
      revoked token is rejected — the `UNATTENDED_SCOPE` fallback is gone for these
      three consumers.
- [ ] Crons still use `UNATTENDED_SCOPE` unchanged — this ticket does not touch them.
- [ ] `docs/adr/0010-*.md` is written, covering the module's design decisions.
- [ ] `docs/adr/0009-*.md` is amended with a note that it's superseded for
      kiosk/till/KDS specifically, not for the crons.
- [ ] A written smoke test (checked into the repo, in the manner of B1's token-hook
      verification and B2's two-organization smoke) covers: a screen pairs, then
      successfully calls kiosk, till-closing and KDS with the same token; the same
      token is rejected by a different organization's equivalent endpoints; revoking
      the token causes all three endpoint groups to reject it immediately; the KDS
      stream's query-parameter token behaves identically to the header form.
- [ ] The deferred register is updated: the old "device identity" line is replaced by
      the two precise rows (this spec; spec C) from the spec's Further Notes table.
