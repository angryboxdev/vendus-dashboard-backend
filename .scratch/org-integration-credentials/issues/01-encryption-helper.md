# 01 — Shared AES-256-GCM encryption helper

**What to build:** A single reusable encrypt/decrypt primitive, living in
`src/infra/crypto/` (infra, not a module — alongside `vendusClient.ts` and
`scoped-db/`), that every integration's credentials adapter will use to store
and retrieve reversible secrets. The key comes from a new
`CREDENTIALS_ENCRYPTION_KEY` environment variable, validated at boot.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `encrypt(plaintext)` / `decrypt(ciphertext)` functions exist, using
      AES-256-GCM, storing ciphertext + IV + auth tag together per value.
- [ ] `decrypt(encrypt(x)) === x` for arbitrary string secrets.
- [ ] A tampered ciphertext (any byte flipped) fails to decrypt (GCM auth tag
      check fails loudly, doesn't silently return garbage).
- [ ] Decrypting with the wrong key fails loudly.
- [ ] `CREDENTIALS_ENCRYPTION_KEY` is validated at process boot (fails fast
      if missing or the wrong length for AES-256) — following the existing
      `must(...)` pattern in `src/config/env.ts`.
- [ ] `CREDENTIALS_ENCRYPTION_KEY` is documented in `render.yaml` as a
      `sync: false` env var (not auto-generated, not committed), matching how
      `VENDUS_API_KEY` is already configured, for both services that need it.
- [ ] Unit tests cover all of the above — no DB involved, pure functions.
