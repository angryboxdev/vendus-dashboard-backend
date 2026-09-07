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

**Status:** done and verified

- [x] `docs/adr/00NN-*.md` is written, covering the encryption mechanism
      choice, the no-rotation-tooling decision, and the rotation runbook.
- [x] `unattended-scope.ts`'s header comment accurately states this spec's
      actual scope (the two crons) and names its known remaining consumers.
- [x] The deferred register / tracking doc reflects this spec as closed.
- [x] `VENDUS_API_KEY`, `VENDUS_REGISTER_ID`, the Vendus price-group/
      payment-ID vars, `AIRMENU_API_KEY`, `AIRMENU_USERNAME`,
      `AIRMENU_PASSWORD`, and `AIRMENU_CLOSING_ENTERPRISE_ID` are confirmed
      absent from `src/config/env.ts` and `render.yaml`.
      (`AIRMENU_WEBHOOK_SECRET`, `AIRMENU_ENTERPRISES`, and
      `AIRMENU_WEBHOOK_URL` remain, by design — see spec.md.)
- [x] Both crons' full test suites and the two-organization smoke test pass.

## Comments

**Finding, ahead of everything else: only one of the two crons was actually
converted.** Ticket 06 converted `process-direct-debits`. Ticket 05
(`daily-vendus-consumption`'s own fan-out) is `won't-do` — that cron is
disabled (`ENV.ENABLE_DAILY_CONSUMPTION_CRON`, off by default; no plan to
re-enable) — so it was never converted and still reads `UNATTENDED_SCOPE`
directly, from three sites: `src/jobs/runDailyVendusConsumption.ts`, the
`daily-vendus-consumption` route in `src/routes/internalCronRoutes.ts`, and
`server.ts`'s own in-process `node-cron` schedule. This isn't a gap this
ticket introduces or needs to fix — it's ticket 05/07's own already-recorded
decision (ticket 07 rescoped its smoke test to `process-direct-debits` for
exactly this reason) — but the closing docs below are written to say this
precisely, not to imply both crons were converted.

**ADR** — `docs/adr/0014-integration-secrets-encrypted-at-the-application-layer.md`.
Covers: application-level AES-256-GCM in `src/infra/crypto/encryption.ts`
vs. `pgcrypto`/a KMS (rejected-because reasoning for both); the deliberate
no-rotation-tooling call (single `CREDENTIALS_ENCRYPTION_KEY`, no
per-row key-versioning column); the rotation runbook itself, written as the
actual procedure (keep the old key live → one-off script decrypts-with-old/
re-encrypts-with-new every row in `vendus_credentials`/`airmenu_credentials`
→ verify with a decrypt round trip using the new key → only then switch the
key in use everywhere → discard the old key); and the named
`AIRMENU_WEBHOOK_SECRET` exception (inbound, enterprise→organization mapping
not resolved yet, deferred to spec D). Related: `docs/adr/0007`,
`docs/adr/0008`, `src/modules/vendus/README.md`,
`src/modules/air-menu/README.md`, `.scratch/org-integration-credentials/spec.md`.

**`src/infra/scoped-db/unattended-scope.ts`'s header** — rewritten. Removed
the false "spec C deletes this file" / "spec.md D6" claims (spec.md for this
spec has no D-numbered sections at all — that anchor never matched). New
header states, by name: what's retired (`process-direct-debits`, kiosk/
till-closing/KDS via `location-credentials` ticket 06) and what's a genuine
remaining consumer — confirmed by reading every non-test hit of
`grep -rln "UNATTENDED_SCOPE" src --include="*.ts" | grep -v __tests__`
(15 files):

| File | Classification |
|---|---|
| `src/routes/internalCronRoutes.ts` | genuine — `daily-vendus-consumption` route only; `process-direct-debits` route converted (ticket 06) |
| `src/jobs/runDailyVendusConsumption.ts` | genuine — standalone script, unconverted (ticket 05 won't-do) |
| `src/server.ts` | genuine — boot-time Vendus/AirMenu credential resolution (single-org bootstrap, not a fan-out problem) *and* its own in-process `node-cron` schedule for `daily-vendus-consumption` |
| `src/jobs/runStockAdjustmentFromLines.ts` | genuine — manual script, explicitly out of scope per spec.md |
| `src/jobs/resetStockMovements.ts` | genuine — manual script, same shape |
| `src/jobs/runVendusCredentialsCutover.ts` | genuine — this spec's own one-time cutover script, seeds Angrybox's row by design |
| `src/jobs/runAirMenuCredentialsCutover.ts` | genuine — same, for AirMenu |
| `src/infra/scoped-db/unattended-scope.ts` | the file itself |
| `src/middleware/device-auth-middleware.ts` | stale/incidental — comment only, describing history; no import |
| `src/modules/location-credentials/adapters/in/location-credential.controller.ts` | stale/incidental — comment only |
| `src/modules/invoices/invoices.module.ts` | stale/incidental — comment only (doc comment not yet updated to name `listOrganizations`/`fanOut` as the direct-debits cron's actual mechanism; left as-is, out of this ticket's file list) |
| `src/modules/invoices/adapters/out/financial-base-supplier-create.adapter.ts` | stale/incidental — comment only, and says the *opposite* (confirms org no longer comes from `UNATTENDED_SCOPE` here) |
| `src/modules/financial-base/financial-base.module.ts` | stale/incidental — comment only |
| `src/modules/cash-closings/adapters/in/cash-closing.controller.ts` | stale/incidental — comment only, historical |
| `src/routes/cashClosingRoutes.ts` | pre-existing dead code, unrelated to this spec — imports and uses `UNATTENDED_SCOPE` but is never mounted in `server.ts` (superseded by the `cash-closings` module's device-token-gated controller; confirmed via `grep -rn "cashClosingRoutes" src`). Not touched — out of this ticket's scope, flagged here for a future cleanup pass. |

**Deferred register** — `.scratch/scoped-access/spec.md`'s row (was line
~750, "Spec C: per-organization credentials, cron fan-out") struck through
and closed, matching the pattern of the two location-credentials rows above
it. Corrected its own claim that spec C "deletes `UNATTENDED_SCOPE`" to
state what actually happened: `process-direct-debits` converted,
`daily-vendus-consumption` not (won't-do, disabled cron), file not deleted.
Links `docs/adr/0014` and this issue.

**Verification:**
- `grep -n "VENDUS_API_KEY\|VENDUS_REGISTER_ID\|UBER_EATS_VENDUS_REGISTER_ID\|VENDUS_EATZ_PAYMENT_ID\|VENDUS_APPS_PAYMENT_ID\|VENDUS_PRICE_GROUP_SALAO\|VENDUS_PRICE_GROUP_EATZ\|AIRMENU_API_KEY\|AIRMENU_USERNAME\|AIRMENU_PASSWORD\|AIRMENU_CLOSING_ENTERPRISE_ID" src/config/env.ts render.yaml`
  — zero matches. `AIRMENU_WEBHOOK_SECRET`, `AIRMENU_ENTERPRISES`,
  `AIRMENU_WEBHOOK_URL` confirmed still present in `src/config/env.ts`.
- `npx tsc --noEmit -p tsconfig.json` — clean.
- Both crons' relevant suites (fan-out foundation, organization listing,
  the cron routes, `process-direct-debits`, and the full `vendus` module):
  `npx jest --config jest.config.cjs src/utils/__tests__/fan-out.test.ts
  src/infra/scoped-db/__tests__/organization-listing.integration.test.ts
  src/routes/__tests__/internalCronRoutes.test.ts
  src/modules/invoices/__tests__/use-cases/process-direct-debits.test.ts
  --testPathPattern="src/modules/vendus"` — 15 suites, 154 tests, all
  passing. (No dedicated fan-out test exists for `daily-vendus-consumption`
  itself since ticket 05 was never built — nothing to run there beyond
  what's covered above.)
- Full suite: `npx jest --config jest.config.cjs` — 167 suites, 1392 tests,
  all passing.
- Issue 07's two-organization smoke test file still reads `**Status:** done
  and verified` with its full write-up intact — not re-run live, per
  instructions.
