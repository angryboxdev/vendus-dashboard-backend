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

**Status:** ready-for-agent

- [ ] Till-closing resolves organization/location via `requireDeviceAuth`.
- [ ] `submit` re-verifies the PIN via the existing `verify-pin` use case; a
      mismatched PIN is rejected where it previously would have been accepted on a
      bare `employeeId`.
- [ ] `submit` is rate-limited per location; repeated submissions past the limit from
      the same screen are rejected.
- [ ] `submit-closing`'s use-case test gains cases for both: PIN-mismatch rejection,
      and rate-limit rejection. `verify-pin`'s existing test remains the sole seam for
      PIN-checking logic itself — not duplicated here.
- [ ] A paired screen's till requests resolve to the paired location; an unpaired
      screen still resolves to `UNATTENDED_SCOPE` (fallback path from ticket 01).
