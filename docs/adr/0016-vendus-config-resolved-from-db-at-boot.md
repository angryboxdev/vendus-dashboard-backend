# Vendus config is resolved from the database once, at server boot

Settles ticket 03 of `.scratch/org-integration-credentials/spec.md`: how the
`vendus` module stops reading `VENDUS_API_KEY`, `VENDUS_REGISTER_ID`
(`UBER_EATS_VENDUS_REGISTER_ID`) and the four price-group/payment-ID env vars,
without rewriting every consumer of `src/infra/vendusClient.ts` for real
per-request multi-tenancy — out of scope per `CLAUDE.md`'s ban on big-bang
legacy refactors, and per the spec's own Scope Boundary (exactly one
organization today, no admin CRUD).

**The decision.** `vendus_credentials` (one row per organization, API key
encrypted via `src/infra/crypto/encryption.ts`) and `vendus_location_config`
(one row per `org_id, location_id`, plain columns) replace the env vars as
the source of truth. `vendus.module.ts` exports
`resolveVendusBootConfig(organizationId, locationId)`, which reads both
tables through `VendusCredentialsPort`/`VendusLocationConfigPort` and throws
if either is missing. `server.ts` calls this once, for `UNATTENDED_SCOPE`,
before mounting any route, then:

- calls `setVendusApiKey(key)` — a new module-level setter in
  `vendusClient.ts`, replacing its direct `ENV.API_KEY` read with a
  once-set singleton;
- builds `VendusModuleConfig`'s four fields from the resolved location
  config instead of `ENV.*`;
- passes the resolved `registerId` into `createCashClosingsModule` as a
  parameter instead of that module reading `ENV.VENDUS_REGISTER_ID`.

**The alternative rejected: thread `organizationId` through
`vendusClient.ts` and every caller, per-request.** This is the
architecturally "correct" multi-tenant shape, and is explicitly not what
this ticket builds. `vendusClient.ts` is a shared infra singleton called
both by the hexagonal `vendus` module's adapters and by several legacy,
non-hexagonal files still mounted live in `server.ts`
(`vendusProductsCatalog.ts`, `kds`'s delivery gateway, `documentsRoutes.ts`,
`cashClosingService.ts`, `documentsService.ts`, `monthlySummaryService.ts`,
`consumableConsumptionService.ts`, `selfconsumptionService.ts`). Making the
API key a per-request value means every one of those call sites gains an
organization parameter it does not have today — a rewrite CLAUDE.md
forbids doing as a side effect of an unrelated ticket, and the spec's Scope
Boundary confirms there is exactly one organization to serve today. The
module-level singleton is deliberately the smaller, reversible move: it
gets the four env vars off the deployment surface now, and is the thing to
revisit — not undo, replace — the day a second organization actually needs
a second Vendus account.

**Fail loud, not degraded, at boot.** `resolveVendusBootConfig` throws
rather than booting with an empty key: a half-configured production server
serving 401s from Vendus on every request is a worse failure mode than a
crash at startup that a deploy dashboard shows immediately. This mirrors
`env.ts`'s existing `must(...)` convention for required config. The one-time
cutover script, `src/jobs/runVendusCredentialsCutover.ts`, is what
guarantees the seeded rows exist before a deploy ever runs without the old
env vars — it reads the same env vars directly (not through `ENV`, which no
longer carries them) and upserts both tables for `UNATTENDED_SCOPE`.

## Consequences

`server.ts`'s top-level module body is now `async` (a top-level `await` on
`resolveVendusBootConfig`, supported under this repo's `nodenext`/`esnext`
TypeScript config) — every module built after the Vendus block already
depended on `vendusModule`/`cashClosingsModule`, so this reorders nothing,
it just makes the existing sequencing wait on a promise.

Every legacy consumer of `vendusClient.ts` keeps working unchanged — they
call `vendusGet`/`vendusPatch`/etc. exactly as before and transparently
receive the DB-sourced key, because the change is inside the shared
singleton, not at their call sites.

`vendus`'s and `cash-closings`' own composition roots stay the only places
that know the concrete Supabase adapters; `resolveVendusBootConfig` is
exported from `vendus.module.ts` alongside `createVendusModule` for the
same reason `getSummary` already is — `server.ts` is the only caller.

Related: `.scratch/org-integration-credentials/spec.md` (Schema,
Encryption, Cutover sections), `docs/adr/0008` (the scoped-query helper both
new adapters use), ticket 01 (the encryption helper), ticket 08 (the
still-pending ADR for the encryption *mechanism* choice itself — AES-256-GCM
at the application layer, and the key-rotation runbook — which this ADR
does not duplicate).
