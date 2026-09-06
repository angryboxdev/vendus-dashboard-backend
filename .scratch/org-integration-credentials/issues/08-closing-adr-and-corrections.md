# 08 — Closing: ADR, key-rotation runbook, comment/register corrections

**What to build:** The transition state stops being the permanent state,
and the spec's paper trail is brought up to date — mirroring how spec E's
own closing ticket (06) handled the same kind of wrap-up.

- A new ADR is written recording: the decision to encrypt reversible
  integration secrets at the application layer (AES-256-GCM, not
  `pgcrypto`/DB-level, not a KMS); the deliberate choice not to build
  key-rotation tooling now; and the key-rotation runbook itself (decrypt with
  the old key, re-encrypt with the new key, verify, then switch).
- `unattended-scope.ts`'s header comment is corrected: it currently claims
  this spec "deletes this file" outright. It's rewritten to name precisely
  what's retired (the two crons) and what remains (
  `runStockAdjustmentFromLines.ts`, and kiosk/till-closing/KDS's fallback
  until spec E's closing ticket lands).
- The deferred register (or whichever doc tracks it, per spec E's ticket 06)
  is confirmed accurate: this spec's line is closed out.
- A final check that the spec's stated done-criteria hold: `VENDUS_API_KEY`
  and the migrated AirMenu env vars are gone; both crons fan out; the two-
  organization smoke test passes.

**Blocked by:** 04, 06, 07

**Status:** ready-for-agent

- [ ] `docs/adr/00NN-*.md` is written, covering the encryption mechanism
      choice, the no-rotation-tooling decision, and the rotation runbook.
- [ ] `unattended-scope.ts`'s header comment accurately states this spec's
      actual scope (the two crons) and names its known remaining consumers.
- [ ] The deferred register / tracking doc reflects this spec as closed.
- [ ] `VENDUS_API_KEY`, `VENDUS_REGISTER_ID`, the Vendus price-group/
      payment-ID vars, `AIRMENU_API_KEY`, `AIRMENU_USERNAME`,
      `AIRMENU_PASSWORD`, and `AIRMENU_CLOSING_ENTERPRISE_ID` are confirmed
      absent from `src/config/env.ts` and `render.yaml`.
      (`AIRMENU_WEBHOOK_SECRET`, `AIRMENU_ENTERPRISES`, and
      `AIRMENU_WEBHOOK_URL` remain, by design — see spec.md.)
- [ ] Both crons' full test suites and the two-organization smoke test pass.
