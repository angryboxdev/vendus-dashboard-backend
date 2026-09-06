# 07 — Two-organization smoke test

**What to build:** A written, checked-into-the-repo smoke test against the
local stack proving the fan-out and isolation decisions actually hold, the
same way spec B2's two-organization smoke test and spec E's pairing/
revocation smoke test prove theirs.

Rescoped from the consumption cron (ticket 05, won't-do — that cron is
disabled) to the direct-debits cron (ticket 06), which has no missing-
credentials skip case, only per-organization failure isolation.

Seed a second local-only organization alongside Angrybox. Run
`process-direct-debits`'s fan-out (ticket 06) and verify:

- Both organizations are processed.
- A forced failure injected for Angrybox's processing does not prevent the
  second organization's processing from completing, and vice versa —
  i.e. the fan-out utility's per-item isolation holds end to end, not just in
  its own unit tests.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] A written smoke test exists, runnable against the local Supabase
      stack, following this repo's existing smoke-test format (see spec B2's
      and spec E's).
- [ ] It seeds a second organization alongside Angrybox.
- [ ] It asserts both organizations are processed by
      `process-direct-debits`'s fan-out.
- [ ] It asserts a forced failure in one organization's processing doesn't
      prevent the other's run from completing.
- [ ] The test is documented as reproducible by a future reader (matching
      the bar set by B2's and E's smoke tests).
