# Phase 1 decisions: D0 accepted as risk, Supabase Auth + TOTP MFA, segment priority

Decided by the user on 2026-10-11, when approving the Phase 0 gate.

- **D0 (legal validation of the specs): accepted risk.** Development goes
  ahead with original texts, icons and layouts (task §4.1); legal validates
  the use of the specifications **before any commercial use**. Until then the
  new HR is internal to Angry Box only.
- **D2 (identity and MFA): keep Supabase Auth** as the identity provider (it
  is the existing login; no new vendor). MFA by authenticator app (TOTP,
  Supabase Auth MFA) is **mandatory for the Admin profile and management
  profiles** of the new HR; their requests must carry an `aal2` session to
  reach administration routes (TK-3). Inactivity expiry and immediate
  revocation are handled server-side (TK-4). The inactivity timeout is a
  setting in the configuration engine, not a constant; the proposed default
  (30 min) is marked `a_validar`.
- **D3 (priority between segments):** personal > group > department >
  centre > global. The first profile that **defines the key** wins (per key,
  not per profile, Configuracoes C11.2). Ties inside the same level are
  broken deterministically: most recent effective date, then profile id.

## Consequences

- The spec's "OIDC" is satisfied by Supabase Auth (an OIDC-compatible
  provider); a corporate IdP can be added later as an extra provider without
  changing the access model.
- The D3 order is code in the resolution service, covered by TK-8; changing
  it is a new ADR.
