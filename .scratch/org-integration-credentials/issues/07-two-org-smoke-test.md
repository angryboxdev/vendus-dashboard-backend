# 07 — Two-organization smoke test

**What to build:** A written, checked-into-the-repo smoke test against the
local stack proving the fan-out and isolation decisions actually hold, the
same way spec B2's two-organization smoke test and spec E's pairing/
revocation smoke test prove theirs.

Seed a second local-only organization and location alongside Angrybox.
Configure Vendus credentials for Angrybox only. Run the consumption cron's
fan-out (ticket 05) and verify:

- Angrybox processes normally.
- The second organization is skipped, with no error, because it has no
  Vendus credentials configured.
- A forced failure injected for Angrybox's processing does not prevent the
  second organization's (non-)processing from completing, and vice versa —
  i.e. the fan-out utility's per-item isolation holds end to end, not just in
  its own unit tests.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] A written smoke test exists, runnable against the local Supabase
      stack, following this repo's existing smoke-test format (see spec B2's
      and spec E's).
- [ ] It seeds a second organization/location and configures Vendus
      credentials for only one of the two.
- [ ] It asserts the configured organization is processed and the
      unconfigured one is skipped without error.
- [ ] It asserts a forced failure in one organization's processing doesn't
      prevent the other's run from completing.
- [ ] The test is documented as reproducible by a future reader (matching
      the bar set by B2's and E's smoke tests).
