# 01 — Shared AES-256-GCM encryption helper

**What to build:** A single reusable encrypt/decrypt primitive, living in
`src/infra/crypto/` (infra, not a module — alongside `vendusClient.ts` and
`scoped-db/`), that every integration's credentials adapter will use to store
and retrieve reversible secrets. The key comes from a new
`CREDENTIALS_ENCRYPTION_KEY` environment variable, validated at boot.

**Blocked by:** None — can start immediately

**Status:** done, verified

- [x] `encrypt(plaintext)` / `decrypt(ciphertext)` functions exist, using
      AES-256-GCM, storing ciphertext + IV + auth tag together per value.
- [x] `decrypt(encrypt(x)) === x` for arbitrary string secrets.
- [x] A tampered ciphertext (any byte flipped) fails to decrypt (GCM auth tag
      check fails loudly, doesn't silently return garbage).
- [x] Decrypting with the wrong key fails loudly.
- [x] `CREDENTIALS_ENCRYPTION_KEY` is validated at process boot (fails fast
      if missing or the wrong length for AES-256) — following the existing
      `must(...)` pattern in `src/config/env.ts`.
- [x] `CREDENTIALS_ENCRYPTION_KEY` is documented in `render.yaml` as a
      `sync: false` env var (not auto-generated, not committed), matching how
      `VENDUS_API_KEY` is already configured, for both services that need it.
- [x] Unit tests cover all of the above — no DB involved, pure functions.

## Comments

Built `src/infra/crypto/encryption.ts`: `encrypt(plaintext, key?)` /
`decrypt(payload, key?)`, AES-256-GCM, `key` defaulting to
`ENV.CREDENTIALS_ENCRYPTION_KEY`. Payload format: base64(iv[12] ||
authTag[16] || ciphertext) as one string (documented in a comment above the
functions). The optional `key` param exists only so the wrong-key test can
pass a second key without touching `ENV`; every real caller uses the
one-arg form.

`src/config/env.ts`: added `mustEncryptionKey(value, name)`, same fail-fast
shape as `must(...)` plus a length check — reads `CREDENTIALS_ENCRYPTION_KEY`
as base64, throws if missing/empty (via `must`) or if the decoded buffer
isn't exactly 32 bytes. Exposed as `ENV.CREDENTIALS_ENCRYPTION_KEY: Buffer`.

`render.yaml`: added `CREDENTIALS_ENCRYPTION_KEY` (`sync: false`) to both
services that already carry `VENDUS_API_KEY` (`vendus-dashboard-api-staging`
web service and `vendus-daily-vendus-consumption` cron) — this repo has only
one `render.yaml`.

Also added `CREDENTIALS_ENCRYPTION_KEY` to `.env.example` (documented,
placeholder value) and to local `.env` (gitignored, a real generated key) so
existing local dev/test runs don't break now that it's a required var.

Tests: `src/infra/crypto/__tests__/encryption.test.ts` — round trip
(including empty string and unicode), random-IV non-determinism, tampered
ciphertext throws, wrong-key throws.

Verification:
- `npx tsc --noEmit -p tsconfig.json` — clean, no errors.
- `npx jest --config jest.config.cjs src/infra/crypto/__tests__/encryption.test.ts`
  — 4/4 passed.
