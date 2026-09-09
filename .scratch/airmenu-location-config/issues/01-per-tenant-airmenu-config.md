# Move remaining AIRMENU_* env vars into airmenu_location_config

Status: open

## Problem

Four `AIRMENU_*` env vars still exist, all process-global instead of
per-tenant. None of them should exist as env vars.

- `AIRMENU_ENTERPRISE_ID` — the AirMenu "menu" enterprise polled for
  catalog/orders.
  - Read (`must(...)`) at `src/config/env.ts:77`.
  - Passed into `createAirMenuModule({ enterprises: [{ id:
    ENV.AIRMENU_ENTERPRISE_ID, name: "Angry Box - Menu" }], ... })` at
    `src/server.ts:114`.
- `AIRMENU_SALES_SUMMARY_ENTERPRISE_ID` — the AirMenu enterprise ID
  aggregated for the sales summary (see ADR-0012: scope is Angry Box main
  enterprise only, Porto excluded).
  - Read (`must(...)`) at `src/config/env.ts:114`.
  - Passed into the module's composition root as
    `config.salesSummaryEnterpriseId` at `src/server.ts:228-231`, declared
    in `SalesSummaryModuleConfig`
    (`src/modules/sales-summary/sales-summary.module.ts:13-16`), used to
    construct `AirMenuSummaryAdapter`
    (`src/modules/sales-summary/sales-summary.module.ts:31-34`), stored as
    `enterpriseId` and passed to
    `airMenuGetSummary.execute(this.enterpriseId, startDate, endDate)`
    (`src/modules/sales-summary/adapters/out/air-menu-summary.adapter.ts:31-34,45-49`).
- `AIRMENU_WEBHOOK_SECRET` — verifies the signature on incoming AirMenu
  webhooks.
  - Read at `src/config/env.ts:89`, passed into `createAirMenuModule({
    webhookSecret: ENV.AIRMENU_WEBHOOK_SECRET })` at `src/server.ts:115`.
- `AIRMENU_WEBHOOK_URL` — declared at `src/config/env.ts:96`. No other
  reference found in `src/` — appears unused/dead currently. Confirm with
  the team whether it's needed before migrating or just remove it.

## Why it's a problem

Env vars are process-global; this backend is mid-migration to
multi-organization/multi-tenant, and a second org/tenant cannot have its
own AirMenu enterprise IDs or webhook secret — onboarding a second tenant
is blocked on this.

## Existing infra to build on (don't design from scratch)

AirMenu config has already been partly migrated off env vars once before
(see spec `org-integration-credentials`, ticket 04 — `src/server.ts:90-91`
comment: "nunca de ENV.AIRMENU_API_KEY/USERNAME/PASSWORD/
CLOSING_ENTERPRISE_ID, que deixaram de existir"):

- **`airmenu_credentials` table** (per `org_id`) — `api_key_encrypted`,
  `username_encrypted`, `password_encrypted`. Port:
  `AirMenuCredentialsPort` (`src/modules/air-menu/domain/ports/out/air-menu-credentials.port.ts`).
  Adapter: `SupabaseAirMenuCredentialsRepository`.
- **`airmenu_location_config` table** (per `org_id` + `location_id`) —
  currently only `closing_enterprise_id`. Port:
  `AirMenuLocationConfigPort`
  (`src/modules/air-menu/domain/ports/out/air-menu-location-config.port.ts`).
  Adapter: `SupabaseAirMenuLocationConfigRepository`
  (`src/modules/air-menu/adapters/out/supabase-air-menu-location-config.repository.ts`).
  Both ports are read-only by design; `upsert` exists on the adapters only
  for the one-time cutover script, not part of the port.

This ticket's job is to extend that same pattern to the remaining env
vars, not introduce a new table.

## Proposed fix

1. Add `sales_summary_enterprise_id` and a menu-enterprise column (name
   TBD, see open decision below) to `airmenu_location_config`, alongside
   the existing `closing_enterprise_id` — migration + `AirMenuLocationConfig`
   entity update.
2. Extend `AirMenuLocationConfigPort` / `AirMenuLocationConfigResult` (or
   add a use-case) so `sales-summary` and the air-menu module bootstrap can
   read these per org+location instead of at env-var load time.
3. `sales-summary` currently has no dependency on the `air-menu` module's
   domain — decide whether it reads through `AirMenuLocationConfigPort`
   directly or gets the resolved enterprise ID handed in at composition
   root (`server.ts`), same as `airMenuClosingEnterpriseId` is today for
   cash-closings.
4. `AIRMENU_WEBHOOK_SECRET`: likely belongs on `airmenu_credentials`
   (integration-level, like the API key) rather than
   `airmenu_location_config` (which is per-location) — confirm with the
   team.
5. `AIRMENU_WEBHOOK_URL`: confirm whether still needed; if not, delete it
   from `env.ts` instead of migrating it.
6. Remove all four env var reads from `src/config/env.ts` and the
   plumbing in `src/server.ts` / `sales-summary.module.ts` once replaced.

Follow this repo's hexagonal rules (CLAUDE.md): domain must not import a
DB client; config crosses via the existing output-port pattern above.

## Open decision (confirm with team before implementing)

Should `closing_enterprise_id`, `sales_summary_enterprise_id`, and a
menu/catalog enterprise ID be three separate columns on
`airmenu_location_config` (as proposed above), or consolidated into fewer
fields? Not decided here — implementation should wait for this.

## Scope note

Descriptive only — no implementation in this ticket.
