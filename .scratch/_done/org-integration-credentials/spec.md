# Spec C — Per-organization integration credentials & cron fan-out

> Status: ready-for-agent
> Architecture reference: `docs/MULTI_TENANCY_SAAS_DESIGN.md` (§2.7, §5, §5.1)
> ADRs: `docs/adr/0005` (org_id denormalized on every table), `docs/adr/0007`
> (app-level scoping is the boundary), `docs/adr/0008` (scoped query helper is
> the sole construction site). This spec writes a new ADR recording the
> app-level AES-256-GCM decision and the deliberate no-rotation-tooling call
> (next free number at implementation time).
> Related: `.scratch/location-credentials/` (spec E) retires `UNATTENDED_SCOPE`
> for kiosk/till-closing/KDS; this spec retires it for the two crons
> specifically — independent specs, no dependency between them (see Further
> Notes).
> Escrito em inglês, seguindo o documento de arquitetura.

---

## Problem Statement

Every Vendus and AirMenu credential this backend uses is a single global
value read from an environment variable — `VENDUS_API_KEY`,
`AIRMENU_API_KEY`/`AIRMENU_USERNAME`/`AIRMENU_PASSWORD`, and the non-secret
IDs that go with them (`VENDUS_REGISTER_ID`, `AIRMENU_CLOSING_ENTERPRISE_ID`,
Vendus price-group and payment IDs). That is correct for exactly one
organization and one location — today's reality — but has no way to be
correct for a second one: there is nowhere to put a second Vendus account's
API key, and nothing to tell the two scheduled crons that a second
organization or a second location exists at all.

The two crons (`daily-vendus-consumption`, `process-direct-debits`) each call
their use case exactly once, hardcoded to `UNATTENDED_SCOPE`'s single
organization (and, for consumption, its single location). Adding an
organization today would silently leave it with no consumption processing and
no direct-debit handling — not an error, just work that never happens.

This is also the last non-device consumer of `UNATTENDED_SCOPE`'s reasoning:
the file's own header names this spec as what retires it for the crons, the
way spec E retires it for the three physical screens.

## Solution

Introduce per-organization (and, for location-scoped values, per-location)
storage for every Vendus and AirMenu credential and configuration value
currently read from `ENV`, and make both crons fan out over every
organization/location that has the relevant integration configured — instead
of the one hardcoded pair.

Reversible secrets (API keys, passwords, webhook secret) are encrypted at the
application layer before being stored; non-secret IDs (register ID, price
groups, payment IDs, closing enterprise ID) are stored in plain columns. Each
integration (Vendus, AirMenu) owns its own tables, port and adapter — there is
no shared "credentials module" — so that adding a third integration later
(a bank integration is the concrete example already anticipated) means adding
one more independent vertical slice, not touching existing ones.

A single generic fan-out utility drives both crons: given a list of items
(organizations, or organization/location pairs) and a per-item async
function, it processes each item independently, skips items that report
"not configured" rather than erroring, isolates one item's failure from the
rest, and returns a pass/fail summary for logging.

## User Stories

1. As a developer, I want Vendus API credentials stored per organization, so
   that a second organization can use its own Vendus account without a code
   change.
2. As a developer, I want AirMenu API credentials (API key, username,
   password) stored per organization, for the same reason.
3. As a developer, I want the Vendus register ID stored per location, so the
   daily consumption job resolves it from data instead of an environment
   variable.
4. As a developer, I want the AirMenu closing-enterprise ID stored per
   location, so cash closings resolve delivery totals from data.
5. As a developer, I want the Vendus price-group and payment-method IDs
   stored per location, for the same reason.
6. As an operator, I want the credentials encryption key managed exactly like
   every other secret in this system (a Render environment variable, not
   synced, never committed), so key management introduces no new process.
7. As a developer, I want one shared AES-256-GCM encrypt/decrypt helper used
   by every integration's credentials adapter, so a future integration (a
   bank connection, or anything else) reuses the same mechanism instead of
   inventing its own.
8. As a developer, I want each integration (Vendus, AirMenu) to own its own
   credentials table, config table, port and adapter end to end, so adding or
   changing one integration never requires touching another's code.
9. As an operator running the daily Vendus consumption cron, I want it to
   process every organization/location that has Vendus configured, so a
   second organization's consumption is handled without a deploy.
10. As an operator running the direct-debits cron, I want it to process every
    organization, for the same reason.
11. As an operator, I want an organization or location with no credentials
    configured for an integration to be silently skipped by that
    integration's cron work, not treated as an error.
12. As an operator, I want one organization's failure during a cron run (bad
    credentials, an API outage, a timeout) to never prevent other
    organizations from being processed in the same run.
13. As a developer debugging a failed cron run, I want a per-item log of
    which organizations/locations succeeded and which failed, so I can
    identify and retry just the failed ones.
14. As a developer, I want the cutover from environment variables to the
    database to happen as one verified deploy per integration — seed, verify,
    flip the read path, remove the environment variable — with no dual-read
    transition period to later close out.
15. As a developer, I want a written two-organization smoke test proving that
    one organization's credentials are invisible to another, that a missing
    integration is skipped rather than erroring, and that one organization's
    failure doesn't block another's run.
16. As a future maintainer, I want a documented key-rotation runbook (decrypt
    every row with the old key, re-encrypt with the new key, verify, then
    switch), so rotating the encryption key doesn't require inventing a
    procedure under pressure, even though no rotation tooling is built now.
17. As a developer, I want `unattended-scope.ts`'s header comment corrected to
    state precisely which consumers this spec retires, so it stops overclaiming
    that this spec deletes the file outright.
18. As a security reviewer, I want every reversible *outbound* integration
    secret in this system encrypted through one shared mechanism, so
    confirming "no plaintext outbound credential is stored anywhere" is a
    single, auditable check. (The AirMenu webhook secret is the one named
    exception — see Implementation Decisions.)
19. As a developer, I want `VENDUS_API_KEY` and the AirMenu outbound
    credential environment variables removed once their integration's
    cutover lands, so no stale fallback path can be silently read instead of
    the database.

## Implementation Decisions

**Scope boundary.** This spec covers exactly: per-organization/per-location
storage for Vendus and AirMenu credentials and configuration, and fan-out for
the two existing crons. It explicitly does not introduce `org_settings`
(branding, plan, feature flags — prospective, nothing reads it today) and
does not build an admin CRUD surface for setting credentials (deferred to the
future onboarding/provisioning work; there is exactly one organization today
and credentials are seeded once by a script, not entered through an API).

**Schema — hard-typed per integration, not a generic table.** Four new
tables, matching this repo's existing convention of explicit-column schemas
(`organizations`, `locations`, `location_tokens`) over a generic key-value
store:

- `vendus_credentials` — one row per organization (`org_id`), holding the
  encrypted Vendus API key.
- `airmenu_credentials` — one row per organization (`org_id`), holding the
  encrypted API key, username, and password (the outbound credentials — see
  the webhook-secret exception below).
- `vendus_location_config` — one row per `(org_id, location_id)`, holding the
  plain register ID and the price-group/payment-method IDs.
- `airmenu_location_config` — one row per `(org_id, location_id)`, holding
  the plain closing-enterprise ID.

A row's absence is the normal, expected way to say "this organization/
location doesn't use this integration" — no separate enabled-integrations
list is introduced. Every port reading these tables returns an explicit
not-configured result (not a thrown error) for a missing row.

RLS is enabled with zero policies on all four tables, matching
`organizations`/`locations`/`location_tokens` — deny-by-default until the
org-claim RLS work (still gated, unrelated to this spec) lands.

**Encryption.** Application-level AES-256-GCM, implemented once as a shared
helper in `src/infra/crypto/` (infra, not a module — alongside
`vendusClient.ts` and `scoped-db/`), used by the Vendus and AirMenu
credentials adapters. Ciphertext, IV and auth tag are stored together per
value. The key comes from a single new environment variable,
`CREDENTIALS_ENCRYPTION_KEY`, managed identically to every other secret in
this codebase — a Render environment variable with `sync: false`, generated
once, never committed, present in local `.env` for local development. No
per-row key-versioning column and no re-encryption tooling are built.

*Key rotation runbook (documented, not built):* to rotate the key, the old
key must remain available for the duration of the rotation. A one-off script
reads every row in `vendus_credentials`/`airmenu_credentials`, decrypts with
the old key, re-encrypts with the new key, and writes back; a decrypt
round-trip with the new key verifies the result before the new key becomes
the only one in use. This is deliberately not automated ahead of need — with
two rows in production today, it is a five-minute script written when
rotation is actually required, not standing infrastructure. This runbook is
recorded in the credentials module's design docs as part of this spec's work
(see Testing Decisions and the module README template).

**Module placement — no new module.** `vendus` and `air-menu` each gain their
own domain output ports (`VendusCredentialsPort`, `AirMenuCredentialsPort` —
naming to match each module's existing port conventions), their own
adapters implementing them against the four tables above, and their own
composition-root wiring. Nothing is shared except the `src/infra/crypto/`
helper. A future integration (bank, or otherwise) repeats this shape
independently: its own table(s), its own port, its own adapter, using the
same shared encryption helper.

**Cutover — one verified deploy per integration, no dual-read.** Unlike
spec E (which needed an expand-and-contract rollout because physical screens
had to be paired by hand over a window this codebase couldn't control), this
is a pure data migration with no external rollout risk. Per integration: a
one-time seed script reads the current environment variable value(s),
encrypts the secrets, writes Angrybox's row(s); a real call against the
integration's API is used to verify the round trip before merging; the
adapter is switched to read from the database; the environment variable
requirement is removed in the same change. No fallback period, no follow-up
"close the transition" ticket.

**Cron fan-out — one shared utility.** A single generic fan-out function
(shape: given a list of items and a per-item async function, process each
independently, skip an item whose lookup reports not-configured, catch and
log any other per-item failure without stopping the rest, return a
pass/fail/skip summary) is introduced once and used by both crons:

- `daily-vendus-consumption` fans out over every `(org, location)` pair;
  a pair with no `vendus_credentials` row for its organization, or no
  `vendus_location_config` row for that location, is skipped.
- `process-direct-debits` fans out over every organization (no location
  granularity — the existing use case already takes only an `organizationId`).

Failure reporting is log-only for this spec — a per-item log line on success/
skip/failure. No new alerting/paging integration is introduced; this
codebase has none today, and adding one is out of scope.

**Explicitly out of scope, but named so nothing is silently lost:**

- `src/jobs/runStockAdjustmentFromLines.ts` keeps using `UNATTENDED_SCOPE`.
  It is a manual, human-invoked script (not a scheduled cron) — whoever runs
  it already knows which organization/location they mean. Converting it to
  take an explicit argument is a small, independent follow-up whenever a
  second organization actually needs a manual adjustment.
- `unattended-scope.ts`'s header comment currently claims this spec "deletes
  this file." That is corrected as part of this work to name precisely what
  is retired (the two crons) and what remains (the manual script above, and
  kiosk/till-closing/KDS's fallback until spec E's closing ticket lands).
- The AirMenu webhook's missing-signature bug is tracked separately —
  `.scratch/airmenu-webhook-signature/` — and has no dependency on this spec.
- `AIRMENU_ENTERPRISES`' per-channel structure (Glovo/Uber Eats/Bolt mapping)
  is a `channels` concern, already flagged as spec D's territory in the
  architecture doc — untouched here.
- `AIRMENU_WEBHOOK_SECRET` stays a global env var, not migrated to
  `airmenu_credentials`. Verifying it per-org first requires resolving which
  organization a webhook belongs to from its `enterpriseId`, which is the
  same enterprise→organization mapping `AIRMENU_ENTERPRISES` carries —
  deferred to spec D for the same reason. Outbound credentials (API key,
  username, password) don't have this problem: every outbound call already
  runs in a known organization's context.

## Testing Decisions

Tests target external behavior at the seams below, not implementation
details, following this repo's existing split between fast domain/use-case
tests (fakes for output ports) and adapter integration tests.

- **Fan-out utility (unit, fakes only).** The single generic fan-out function
  is tested directly: an item with no configured credentials is skipped, not
  errored; one item's thrown failure doesn't prevent the remaining items from
  running; the returned summary correctly reports success/skip/failure
  counts. This one seam covers the fan-out behavior for both crons at once —
  no need to duplicate these cases per cron.
- **Encryption helper (unit, no DB).** Encrypt-then-decrypt round trip
  returns the original plaintext; a tampered ciphertext fails to decrypt
  (GCM auth tag check); decrypting with the wrong key fails. Pure function,
  no fakes needed.
- **Credentials/config repository adapters (integration, local Supabase
  stack).** One test per table: write then read round-trips correctly
  (through encryption for the two credentials tables); a missing row reports
  not-configured rather than throwing. Prior art: the existing adapter
  integration tests in `location-credentials` and `scoped-access`'s
  per-module conversions.
- **Two-organization smoke test (written, checked into the repo).** Following
  the precedent set by spec B2 (two-organization isolation smoke) and spec E
  (pairing/revocation smoke): seed a second local-only organization and
  location; configure Vendus credentials for the first only; run the
  consumption fan-out; verify the first organization processes normally, the
  second is skipped without error, and a forced failure injected for the
  first organization does not prevent the second from running (and vice
  versa).
- **Vendus/AirMenu module unit tests** for the new ports/use-cases that
  resolve credentials, using fakes for the new output ports — matching how
  `vendus`/`air-menu`'s existing use cases are already tested.

## Out of Scope

- `org_settings` (branding, plan, feature flags) — nothing reads this today;
  deferred indefinitely, not part of this spec's phase.
- An admin CRUD/HTTP surface for setting or rotating credentials — deferred
  to the future onboarding/provisioning spec (phase 11), which will build it
  on top of the schema and encryption this spec ships.
- Key-rotation tooling (an automated re-encrypt script/job) — the procedure
  is documented, not built, per the Implementation Decisions above.
- Converting `runStockAdjustmentFromLines.ts` off `UNATTENDED_SCOPE`.
- The AirMenu webhook signature bug — tracked and scoped separately in
  `.scratch/airmenu-webhook-signature/`.
- Any change to `AIRMENU_ENTERPRISES`/channel modeling — spec D's territory.
- Migrating `AIRMENU_WEBHOOK_SECRET` to per-organization — blocked on the
  same enterprise→organization mapping, so deferred alongside it.
- New alerting/paging for cron failures — log-only, matching this codebase's
  current operational baseline.
- Composite foreign keys, indexes, or any of the other items still deferred
  behind spec A's "organization #2" gate — unaffected by this spec.

## Further Notes

**No dependency on spec E (location-credentials).** Spec E's own scoping
(D1) explicitly rejected folding cron fan-out into the pairing/credential
design because the two problems ("which physical screen is this" vs. "which
organizations exist") share no mechanism. This spec's prerequisites are
specs A, B1 and B2 (all closed) — not E. The only coordination point is that
both specs touch `unattended-scope.ts`'s comment and, eventually, `docs/adr/
0009`'s amendment — landing spec E's closing ticket first avoids a trivial
merge conflict there, but doesn't block writing or starting this spec.

**A second location is a nearer-term reality than a second organization.**
`locations` already supports multiple rows per organization today with none
of the blockers gating a second `organizations` row (see
`src/jobs/runOrganizationProvisioning.ts`'s "ORGANIZATION #2 GATE"). This is
why the location-scoped config tables are keyed by `(org_id, location_id)`
from day one rather than assuming one location per organization.

**Deferred register.** Once this spec closes, `unattended-scope.ts` has
exactly one class of consumer left: kiosk/till-closing/KDS's fallback, which
spec E's own closing ticket (06) already tracks removing. This spec's closing
work should confirm that entry is accurate rather than adding a new one.
