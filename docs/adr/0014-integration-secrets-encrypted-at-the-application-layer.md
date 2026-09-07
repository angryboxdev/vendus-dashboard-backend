# Integration secrets are encrypted at the application layer, not rotated by tooling yet

Settles spec C's encryption decisions (`.scratch/org-integration-credentials/spec.md`,
Implementation Decisions §"Encryption"; ticket 01). Every reversible outbound
integration secret this backend stores — the Vendus API key
(`vendus_credentials`) and the AirMenu API key, username and password
(`airmenu_credentials`) — is encrypted before it reaches the database, using
one shared helper, not a database-level mechanism and not a managed key
service.

**Encryption is application-level AES-256-GCM, implemented once in
`src/infra/crypto/encryption.ts`, not `pgcrypto` and not a KMS.** `encrypt`/
`decrypt` take a plaintext/payload and a key (defaulting to
`ENV.CREDENTIALS_ENCRYPTION_KEY`), and store ciphertext, IV and auth tag
together as one base64 string per value — `base64(iv[12] || authTag[16] ||
ciphertext)`. `pgcrypto` (`pgp_sym_encrypt`/`pgp_sym_decrypt` at the SQL
layer) was rejected: it would put the encryption key inside every query that
touches these columns, reachable by anything with SQL access (including the
Supabase dashboard's SQL editor), and ties the mechanism to Postgres
specifically when a future integration's storage need might not be a
Postgres column at all. A managed KMS (AWS KMS, GCP KMS, Supabase Vault) was
also rejected: it's a new external dependency and a new network round trip
per encrypt/decrypt call, for a workload of two secret-bearing tables and,
today, exactly one organization's worth of rows — this codebase already has
a policy of not adding infrastructure ahead of an actual need (the same
reasoning that keeps the fan-out utility's concurrency at a plain
`mapLimit`, not a queue). A single Node `crypto` helper, called from each
integration's own adapter, keeps the mechanism boring, dependency-free, and
exactly as portable as the rest of this codebase.

**One key, one environment variable, managed exactly like every other
secret.** `CREDENTIALS_ENCRYPTION_KEY` is a Render environment variable with
`sync: false`, generated once, never committed, present in local `.env` for
local development — the same treatment `VENDUS_API_KEY` had before this spec,
and every other secret in this codebase has today (user story 6). It's
validated at boot (`mustEncryptionKey` in `src/config/env.ts`): missing or
not exactly 32 bytes after base64 decoding fails the process immediately,
the same fail-fast shape as every other `must(...)`-guarded variable.

**No key-rotation tooling is built now — no per-row key-versioning column,
no automated re-encrypt job.** Every row in both credentials tables is
encrypted with whatever key `CREDENTIALS_ENCRYPTION_KEY` currently holds; a
row doesn't record which key version produced it. A versioning column plus
an automated rotation pipeline (the shape used by systems that expect
frequent rotation across many keys and many rows) was rejected: with two
credential-bearing tables and, today, one organization's worth of rows in
each, that infrastructure would be built and maintained for years before it
is ever exercised. This is the same judgment call spec C makes for cron
failure alerting (log-only, no paging integration, because this codebase has
none today) and the same one made for the fan-out utility's concurrency
control — building the general mechanism only when a concrete need presses
on it, not speculatively.

**The key-rotation runbook is documented instead, so rotating under pressure
doesn't mean inventing a procedure under pressure (user story 16).** To
rotate `CREDENTIALS_ENCRYPTION_KEY`:

1. Keep the old key available for the duration of the rotation — do not
   remove or overwrite the `CREDENTIALS_ENCRYPTION_KEY` Render env var yet.
2. Write a one-off script that reads every row in `vendus_credentials` and
   `airmenu_credentials`, calls `decrypt(value, oldKey)` on each encrypted
   column, then `encrypt(plaintext, newKey)`, and writes the new ciphertext
   back to the same row.
3. After the script runs, read every row back and run
   `decrypt(value, newKey)` on it — a decrypt round trip with the new key,
   not just a successful `encrypt` call — to verify the rotation actually
   produced decryptable ciphertext before anything depends on it.
4. Only once every row verifies does the new key become the one in use:
   update `CREDENTIALS_ENCRYPTION_KEY` in Render (staging and production, and
   in every developer's local `.env`) to the new value, and redeploy.
5. Only after the new key is confirmed live everywhere does the old key get
   discarded.

This is deliberately a script written when rotation is actually needed, not
standing infrastructure maintained in the meantime — with two rows in
production today, it's a five-minute job, not a project.

**The one named exception: `AIRMENU_WEBHOOK_SECRET` stays a global env
var, not migrated to `airmenu_credentials` (user story 18, spec.md
"Explicitly out of scope").** Every other secret this spec covers is
*outbound*: this backend calls Vendus or AirMenu already knowing which
organization it's acting for, so encrypting and looking up that secret
per-organization is straightforward. The AirMenu webhook secret verifies an
*inbound*, unauthenticated call — before it can be looked up per
organization, the backend first has to know which organization the webhook
belongs to, and the only signal for that is the payload's `enterpriseId`.
Resolving `enterpriseId` to an organization is the same enterprise→
organization mapping `AIRMENU_ENTERPRISES` already carries, which is a
`channels` concern explicitly deferred to spec D. Migrating the webhook
secret ahead of that mapping would mean building a one-off, throwaway
resolution path now and replacing it again once spec D lands — so it's left
as a single global env var until then, and "no plaintext outbound
credential is stored anywhere" (user story 18) is a claim about outbound
secrets specifically; the webhook secret is inbound and out of that claim's
scope by design, not an oversight.

## Consequences

Every reversible outbound integration secret in this system — Vendus API
key; AirMenu API key, username, password — goes through one mechanism,
implemented once. Confirming "no plaintext outbound credential is stored
anywhere" is a single check: `src/infra/crypto/encryption.ts` is the only
place that calls Node's `crypto`, and every credentials adapter (
`SupabaseVendusCredentialsAdapter`, `SupabaseAirMenuCredentialsRepository`)
routes through it symmetrically (encrypt on write, decrypt on read). A third
integration (a bank connection, or anything else this codebase eventually
adds) repeats this shape independently — its own table, its own port, its
own adapter — reusing this same helper rather than inventing a new one.

Rotation stays a documented, human-run procedure rather than a system this
codebase operates day to day. If a future spec brings in enough
credential-bearing rows, or a compliance requirement forces routine
rotation, the version-column/automated-pipeline design this ADR rejects is
the one to build then — this decision is about today's actual load, not a
permanent rejection of that shape.

`AIRMENU_WEBHOOK_SECRET` remains a loose end this spec knowingly leaves: it
is the one reversible secret this system uses that isn't covered by "every
outbound secret is encrypted through one mechanism," because it isn't
outbound. It's tracked, not lost — spec D inherits it alongside
`AIRMENU_ENTERPRISES`.

Related: `docs/adr/0007` (app-level scoping as the tenant boundary — the
same "one mechanism, not a per-endpoint rule" shape applied here to
encryption instead of query scoping), `docs/adr/0008` (the scoped-query
helper as the sole construction site — the credentials adapters use it the
same way every other adapter does), `src/modules/vendus/README.md` ("Ports",
"Adapters" and "Resolução de configuração no boot" sections),
`src/modules/air-menu/README.md` ("Decisões de design" and the Ports/Adapters
tables), `.scratch/org-integration-credentials/spec.md` (Implementation
Decisions §"Encryption", user stories 6, 7, 16, 18, 19), and
`.scratch/org-integration-credentials/issues/01-encryption-helper.md`,
`03-vendus-credentials-and-config.md`, `04-airmenu-credentials-and-config.md`.
