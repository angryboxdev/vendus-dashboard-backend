# The new HR system evolves the Mezza ERP, not a new product

Task RH (phased), Phase 0, ADR-001 / decision D1 (technology). Decided by the
user on 2026-10-11: build the HR & attendance system described in
`Especificacao_RH_*` **inside this backend and the existing frontend**, for
Angry Box only, instead of starting a separate repository or stack.

Stack stays as is: Node + Express 5 + TypeScript, Supabase (Postgres) through
the scoped-query helper (ADR-0007/0008), Jest; frontend React + Vite + React
Query + Vitest. New HR code follows the hexagonal pattern in `src/modules/`
(reference: `tasks`); the legacy HR code is not extended.

The new model is shown under a separate **"Novo RH"** entry in the frontend
HR area, so the work in progress does not mix with the current HR screens.
When it is complete and validated it can become the main HR; that switch is a
separate decision.

## Consequences

- Phases 1–9 reuse the access module (route table + profiles), organizations
  and locations instead of rebuilding identity. Gaps against the spec
  (OIDC/MFA — D2, `tenant_id` naming, configuration engine) are handled in
  their phases and recorded as deviations in the gate reports.
- The tenant column keeps its existing name `org_id` (ADR-0005); the spec's
  `tenant_id` maps to it.
- Specs are functional input only. No code, texts, icons or layouts from the
  observed product (task §4.1); D0 (legal validation) still blocks Phase 1.
