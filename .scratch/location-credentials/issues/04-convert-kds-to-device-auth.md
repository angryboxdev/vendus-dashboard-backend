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

**Status:** ready-for-agent

- [ ] All KDS routes (advance, cancel, stream) require `requireDeviceAuth`; a request
      with no token, an unknown token, or a revoked token is rejected the same way a
      stranger who finds the URL is rejected today by nothing.
- [ ] The stream route accepts the token as a query parameter; every other KDS route
      uses the header form. The query-parameter exception is documented inline as
      deliberate.
- [ ] The stream keeps updating in real time after pairing — no behavior regression
      to polling/reload-to-see-new-orders.
- [ ] A paired screen's KDS requests resolve to the paired location; an unpaired
      screen still resolves to `UNATTENDED_SCOPE` (fallback path from ticket 01).
