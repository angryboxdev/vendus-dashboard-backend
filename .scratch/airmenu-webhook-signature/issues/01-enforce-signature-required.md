# 01 — Reject AirMenu webhook requests missing the signature header

**What to build:** When `AIRMENU_WEBHOOK_SECRET` is configured, a request
with no `x-airmenu-signature` header is rejected with 401, same as a
mismatched signature. Currently it only warns and proceeds. When no secret is
configured, behavior is unchanged (skip check — existing dev/unconfigured
path).

**Status:** done, verified

- [x] `webhookSecret` set + header missing → `401 { error: "Invalid webhook
      signature" }`, handler returns before touching `req.body`.
- [x] `webhookSecret` set + header present + mismatch → unchanged (already
      401).
- [x] `webhookSecret` set + header present + match → unchanged (processes
      normally).
- [x] `webhookSecret` not configured → unchanged (processes normally,
      warning logged).
- [x] Unit/integration test covering all four cases above.

## Comments

Implemented in `src/modules/air-menu/adapters/in/air-menu.controller.ts`:
the missing-header case now rejects with 401 before the handler touches
`req.body` (moved ahead of the debug log line too, not just the JSON
verification step). Test:
`src/modules/air-menu/__tests__/adapters/in/air-menu-webhook-signature.test.ts`
(4 cases, real Express router + real HTTP server, no supertest — mirrors
`cash-closings`' `public-router-scope.test.ts` pattern). Full suite (168
suites / 1396 tests) and `tsc --noEmit` both pass. Not committed per
`/implement-repo`.
