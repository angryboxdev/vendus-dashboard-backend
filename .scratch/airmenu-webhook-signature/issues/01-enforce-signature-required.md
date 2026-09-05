# 01 — Reject AirMenu webhook requests missing the signature header

**What to build:** When `AIRMENU_WEBHOOK_SECRET` is configured, a request
with no `x-airmenu-signature` header is rejected with 401, same as a
mismatched signature. Currently it only warns and proceeds. When no secret is
configured, behavior is unchanged (skip check — existing dev/unconfigured
path).

**Status:** ready-for-agent

- [ ] `webhookSecret` set + header missing → `401 { error: "Invalid webhook
      signature" }`, handler returns before touching `req.body`.
- [ ] `webhookSecret` set + header present + mismatch → unchanged (already
      401).
- [ ] `webhookSecret` set + header present + match → unchanged (processes
      normally).
- [ ] `webhookSecret` not configured → unchanged (processes normally,
      warning logged).
- [ ] Unit/integration test covering all four cases above.
