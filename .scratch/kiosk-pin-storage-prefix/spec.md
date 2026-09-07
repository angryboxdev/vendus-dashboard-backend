# Kiosk PIN fix & storage path org-prefixing

> Status: ready-for-agent
> Última atualização: 2026-09-07
> Architecture reference: `docs/MULTI_TENANCY_SAAS_DESIGN.md` (§2.6 point 3, §5.1, §6 item 3)
> ADRs: `docs/adr/0007` (app-level scoping is the boundary), `docs/adr/0008`
> (scoped query helper), `docs/adr/0009` (location is caller-supplied),
> `docs/adr/0010` (location credentials replace unattended scope). Section B
> needs a new ADR — see D-B4.
> Predecessors: `.scratch/_done/org-location-foundation/spec.md` (spec A —
> named both items as gate item 5 and gate item 6), `.scratch/_done/scoped-access/spec.md`
> (B2 — format precedent, and D17/D10 which built the storage wrapper this
> spec finishes), `.scratch/_done/location-credentials/spec.md` (spec E —
> already closed half of gate item 5, see Section A below)
> Frontend repo: `/Users/viniciusbazanella/projects/vendus-dashboard-frontend`
> (this backend's `CLAUDE.md` states a stale path; the memory note
> `frontend-repo-path` and this header carry the real one)
> Escrito em inglês, seguindo o documento de arquitetura.

---

## Problem Statement

Spec A deferred six items behind a hard gate: **no second `organizations` row
until every item lands.** Four of the six are large, mechanical schema work
(composite foreign keys, composite indexes, CRM primary key restructuring) —
covered by sibling specs, not this one. The remaining two are small, narrow,
unrelated-to-each-other fixes that don't deserve the review posture of a
sweeping schema migration, but still block the gate:

- **Gate item 5 — kiosk PIN.** `hr_employees.kiosk_pin_hash` carries a global
  partial unique index. Spec A's own reasoning (D7) was that scoping the
  index while the *lookup* stayed blind to organization would convert "a
  minor enumeration leak into a cross-tenant authentication hole" — so
  neither was touched, and the item was left for later, whole.
- **Gate item 6 — storage path org-prefixing.** HR employee documents and
  invoice PDFs are written to Supabase Storage at organization-agnostic
  paths. Spec A's reasoning (via `.scratch/_done/scoped-access/spec.md` D17,
  which is where the actual object-storage code now lives) was that
  prefixing is "meaningless without the `storage.objects` policies it pairs
  with" — i.e. this was never meant to be a lone path-rename.

This spec is one document, not two, because both items are independently
small and mechanical — the opposite of the schema specs' size and blast
radius — but it keeps two clearly separated sections because the subsystems
share nothing: Section A is kiosk device authentication, Section B is object
storage. Each gets its own Solution, Implementation Decisions and Testing
Decisions; only the framing above, and the deferred register / cross-repo
contract / risks in Further Notes, are shared.

**What's changed since spec A wrote gate item 5 down.** Spec E
(`location-credentials`) shipped in between and, as a side effect of
converting the kiosk to `requireDeviceAuth`, closed part of item 5 without
meaning to — see Section A's Problem Statement for the specifics, confirmed
by reading the current code rather than trusting spec A's now-stale
citations. This is exactly the kind of drift a hard-gate list accumulates
between when it's written and when it's finally worked, and this spec
records the corrected state rather than repeating what's no longer true.

## User Stories

1. As an employee clocking in at the kiosk, I want my check-in to keep
   working exactly as it does today, so that this fix is invisible on the
   floor.
2. As an operator running more than one organization in the future, I want
   two employees in different organizations to be able to hold the same
   4-digit PIN, so that the PIN space isn't shared and exhausted globally.
3. As an operator, I want a kiosk scan performed from a device other than
   the paired tablet to still be rejected unless it can present a real
   paired credential, so that removing the unattended fallback (spec E)
   didn't just move the hole from "no organization filter" to "no reliable
   way to present one."
4. As an HR admin, I want an employee's uploaded documents to live under a
   path that identifies their organization, so that a future
   `storage.objects` policy has something to key on without a data
   migration first.
5. As the operator of the product, I want new invoice PDFs and HR documents
   written from day one under an org-scoped path, so that the second
   organization's documents are never mixed into the first's path space
   even before any backfill is considered.
6. As a future maintainer, I want the `storage.objects` RLS policies
   designed in the same spec as the path convention they depend on, so that
   "path-prefixed but unpoliced" is never a real, if temporary, state of the
   system.
7. As a future maintainer, I want the buckets this spec deliberately leaves
   unprefixed named explicitly, so that "we forgot those three" isn't how
   the next spec discovers them.
8. As a developer, I want the frontend change confined to the kiosk's QR
   URL and check-in page, so that fixing a backend authentication gap
   doesn't require touching unrelated frontend modules.

---

## Section A — Kiosk PIN fix

### Problem Statement (Section A)

Spec A's D7 named two hazards under one item: the index
(`hr_employees_kiosk_pin_hash_uq`, a global `CREATE UNIQUE INDEX ... WHERE
kiosk_pin_hash IS NOT NULL` from migration `033`) and two PIN lookups with no
organization filter. Reading the current code shows the shape of the problem
has moved:

- **The index is still global.** Unchanged since migration `033`. A PIN is a
  4-digit space (10,000 values); a global unique constraint means two
  employees in *different* organizations cannot hold the same PIN, which
  will start rejecting legitimate assignments as soon as a handful of
  organizations exist — not a security hole, but a real operational one, and
  the reason gate item 5 asked for the index to become `(org_id,
  kiosk_pin_hash)`.
- **Both lookups are now organization-scoped, already.** Spec E's ticket 02
  converted `POST /kiosk/scan` to resolve its organization from
  `requireDeviceAuth` instead of the hardcoded `UNATTENDED_SCOPE` constant.
  `findActiveEmployeeByPinHash` (`src/services/hrEmployeeService.ts`) and
  `SupabaseEmployeeRepository.findActiveByPinHash`
  (`src/modules/cash-closings/adapters/out/supabase-employee.repository.ts`)
  both already build their query through a scoped-query factory
  (`createScopedQuery(organizationId)` / the injected `ScopedQueryFactory`),
  which unconditionally applies the organization filter before the
  `kiosk_pin_hash` predicate runs. Ticket 02's own closing comment records
  this as resolved and marks the "kiosk PIN collision across organizations"
  row in `scoped-access/spec.md`'s deferred register as closed. **This spec
  has nothing to build for the lookup-scoping half of gate item 5** — it is
  verified done, not re-done, in this spec's done-criteria.
- **The QR payload still carries no identity, and now that matters more.**
  Spec E's ticket 06 went further than D7 anticipated: it removed the
  `UNATTENDED_SCOPE` fallback entirely from `requireDeviceAuth`. Today, a
  request to `POST /kiosk/scan` with no valid, unrevoked `X-Device-Token`
  header is unconditionally rejected with 401 — there is no more "falls back
  to the one organization" safety net. Reading the frontend
  (`vendus-dashboard-frontend`) shows this credential is sourced from
  `window.localStorage` on whichever browser calls the endpoint
  (`local-storage-device-token.adapter.ts`, key `angrybox.deviceToken`,
  read by the shared `deviceFetch` wrapper that `hrApi.ts`'s `kioskScan`
  goes through) — and the QR code the kiosk tablet displays
  (`KioskDisplayPage.tsx`) encodes only `{ date, token }` (the daily
  anti-replay HMAC from the unauthenticated `GET /kiosk/daily-token`) into
  the URL that `KioskCheckinPage.tsx` reads. Neither the daily-token response
  nor the QR URL carries the paired device token or any other org/location
  identifier. Whatever device opens `/kiosk/checkin` — the same paired
  tablet, or an employee's own phone after scanning the QR with its camera
  (the UI copy says exactly this: "Aponta a câmara do telemóvel") —
  determines whether the scan request has valid device credentials in its
  own `localStorage`, and the QR does nothing to make that reliable. **This
  is the concrete shape gate item 5's "QR payload carries an org/location
  identifier" ask has today** — not a future multi-tenancy nicety, but a
  live gap in a flow that already unconditionally requires a device
  credential it has no reliable way to hand a second device.

The index migration is a pure backend, low-risk fix once the lookups are
confirmed scoped (they are). The QR-payload fix is the section's one
frontend-touching item, and per this repo's `CLAUDE.md` ("Repositories") that
means the frontend repo is touched in the same task.

### Solution (Section A)

Two independent fixes, verified and shipped separately since neither depends
on the other:

1. **The index becomes composite.** `(org_id, kiosk_pin_hash)`, online, via
   the same technique ADR-0009/spec B2 already proved for the location
   composite keys: `CREATE UNIQUE INDEX CONCURRENTLY` against the new
   column pair, then drop the old global index in the same migration (index
   swaps, unlike foreign keys, don't need a `NOT VALID` / `VALIDATE
   CONSTRAINT` two-step — the new index is either valid or the migration
   fails outright).
2. **The QR-encoded URL carries the device credential.** The kiosk tablet
   already holds a paired device token in its own `localStorage` (that's
   what makes its own admin-side requests, e.g. till-closing, work). The
   fix threads that same token into the QR's URL as a query parameter, and
   `KioskCheckinPage` reads it and presents it explicitly on the
   `POST /kiosk/scan` call — rather than relying on the *scanning* device's
   own `localStorage`, which for an employee's personal phone will
   virtually never hold one.

### Implementation Decisions (Section A)

#### DA1 — The index migration is online and mechanical, no lookup change

The lookups are already scoped (confirmed above); this decision covers only
the index. `CREATE UNIQUE INDEX CONCURRENTLY hr_employees_kiosk_pin_hash_org_uq
ON hr_employees (org_id, kiosk_pin_hash) WHERE kiosk_pin_hash IS NOT NULL`,
then `DROP INDEX hr_employees_kiosk_pin_hash_uq` in the same migration file
(the drop is instant and does not need `CONCURRENTLY`). `CREATE INDEX
CONCURRENTLY` cannot run inside a transaction, and the Supabase CLI wraps
each migration file in one — this needs its own migration with the implicit
transaction disabled (spec A's original note on this, still true), or a
deliberate manual run outside the normal migration flow, exactly as spec B2
had to handle for the location composite indexes it deferred.

Rejected: leaving the index global and relying solely on the app-level
scoped lookup. That was spec A's own D7 position when the lookup was blind;
now that the lookup is scoped, the index's only remaining job is the
PIN-collision *operational* problem (blocking legitimate same-PIN
assignments across organizations), which the scoped lookup does nothing to
fix — the index and the lookup were never solving the same problem, D7
conflated them because at the time neither existed.

#### DA2 — The kiosk tablet's own paired token rides in the QR URL, not a new credential

The QR/URL gains one query parameter carrying the same device token already
issued to the tablet at pairing time (`location-credentials`,
`src/modules/location-credentials`) — no new credential type, no new pairing
flow, no backend endpoint change to `GET /kiosk/daily-token` (it stays
scope-agnostic; the frontend already holds the device token client-side and
assembles the URL from both pieces).

Rejected: minting a fresh, QR-specific short-lived credential server-side.
This would need a new endpoint, a new token type, and a new verification
path, to solve a problem the existing paired-device token already solves —
duplicating spec E's device-identity model rather than reusing it. The
daily HMAC token (`GET /kiosk/daily-token`) already plays the
short-lived/anti-replay role; there is no gap for a second short-lived
token to fill.

#### DA3 — Open implementation choice: widen `requireDeviceAuthAllowingQueryParam`, or read-and-reattach on the frontend

Two ways to get the device token from the QR's query string onto the
`POST /kiosk/scan` request, and this spec does not pick one — it is scoped
as a real decision point for whoever writes the implementation ticket,
because `device-auth-middleware.ts`'s own comment is explicit that widening
transport is not a decision to make silently:

- **(a) Widen the backend to accept the query param on this route.**
  `requireDeviceAuthAllowingQueryParam` and `DEVICE_TOKEN_QUERY_PARAM`
  already exist, built for exactly one approved exception (`GET
  /kds/stream`, because `EventSource` cannot set custom headers) and
  explicitly *not* wired anywhere else — "using it elsewhere would silently
  widen every other route to accept a token via query string too, which is
  not what D7 approved." Reusing it for `POST /kiosk/scan` needs the same
  kind of deliberate sign-off D7 gave KDS, not silent reuse.
- **(b) Keep the backend as `requireDeviceAuth` (header-only)** and have
  `KioskCheckinPage` read the query param and attach it as an ordinary
  `X-Device-Token` header on its own `fetch` call — no backend change, no
  widening of what any route accepts over the query string, at the cost of
  the frontend needing its own device-token-from-URL wiring distinct from
  the shared `deviceFetch`/`localStorage` path every other device-auth
  consumer uses.

(b) costs nothing on the backend and doesn't touch the query-string
transport decision D7 deliberately scoped narrowly; (a) is more uniform with
KDS's precedent but reopens a decision the location-credentials spec closed
on purpose. Leaning (b) for that reason, but this is recorded as a decision
for the implementation ticket, not decided here.

### Testing Decisions (Section A)

- **Index migration:** a migration-level check (matching spec B2's own
  precedent for the location composite indexes) that the new composite
  index exists and the old global one is gone; no application code changes,
  so no new unit test is expected beyond confirming the two lookups still
  pass their existing tests unchanged.
- **QR/device-token flow:** an integration-level test (or, at minimum, a
  manual verification written up the way spec B1/E did) that a scan
  performed with the device token attached via the new URL-carried path
  succeeds, and one performed with no token attached still 401s exactly as
  today. `hrKioskRoutes.ts` itself has no existing controller-level test
  (noted already in location-credentials ticket 02) — this spec does not
  change that baseline, only whichever seam DA3's chosen option adds.
- **Done-criterion for the already-closed lookup half:** re-confirm (not
  re-fix) that both `findActiveByPinHash` and `findActiveEmployeeByPinHash`
  filter by organization before the PIN-hash predicate — a regression test
  asserting this would have caught it going the other way, and its absence
  today is a gap this spec can close cheaply alongside DA1's migration test,
  since the fixture is already at hand.

---

## Section B — Storage path org-prefixing

### Problem Statement (Section B)

The sole object-storage construction site,
`src/infra/scoped-db/object-storage.ts` (D10/ADR-0008's import rule makes it
the only place in `src/**` allowed to touch Supabase Storage, same as the
scoped-query helper for the database), already carries a header comment
saying exactly what's missing: "Deliberately no organization parameter and
no path prefixing... gains an organization when the prefixing actually
happens, not before." This spec is that "when."

Two consumers, two different exposure shapes:

- **HR employee documents** (`src/services/hrDocumentService.ts`, bucket
  `hr-documents`). Paths are built as `${employeeId}/${id}/${safeName}`
  (`uploadDocument`) — no organization segment. Reads go through
  `getDocumentSignedUrl`, called from
  `GET /employees/:id/documents/:docId/download-url`
  (`src/routes/hrRoutes.ts`), which **does** already validate organization
  ownership at the app layer first — `listDocuments(req.auth!.orgId, ...)`
  runs before any signed URL is produced, so a cross-org read is already
  blocked by the same app-level scoping boundary ADR-0007 established as
  primary. The bucket is private; a signed URL expires in 120 seconds.
- **Invoice PDFs**
  (`src/modules/invoices/adapters/out/supabase-document-storage.adapter.ts`,
  bucket `invoice-documents`). Paths are built as
  `${timestamp}_${safeName}` — no organization segment, and the bucket is
  **public**: `objectStorage.getPublicUrl` returns a permanent,
  unauthenticated URL with no expiry and no signature. This is a materially
  different exposure shape from HR documents — anyone who obtains an invoice
  PDF's URL can read it forever, with no app-level check in the loop at all,
  because there is no "generate a signed URL" request for the app to gate.
  Path-prefixing and RLS policies change what a *listing* or a *guessed*
  path can reach; they do nothing for a URL some other legitimate process
  (an email, a saved bookmark) already holds. That's an accepted,
  pre-existing property of a public bucket, not something this spec is
  positioned to fix, and it is named here so a future reader doesn't
  mistake the scope of what prefixing buys for this bucket specifically.

No `storage.objects` RLS policies exist anywhere in `supabase/migrations/`
today (confirmed by search) — this part of §2.6 point 3 has not been
designed at all yet, matching what ADR-0007 and the deferred registers
already say.

**A third fact, not named in §2.6 point 3 or spec A's item 6, surfaced by
reading every caller of the shared wrapper rather than trusting the design
doc's own two named consumers:** `objectStorage` has five callers, not two.
Alongside `hr-documents` and `invoice-documents`, `payable-recurrences`
writes to bucket `recurrence-documents`
(`supabase-document-storage.adapter.ts`), `bank-statements` writes to
`bank-statement-documents`
(`supabase-bank-document-storage.adapter.ts`), and
`supplierInvoiceImportService.ts` writes to `invoice-imports` — all three
through the identical `objectStorage.upload/remove/...` calls, all three at
equally unprefixed paths. Adding an organization parameter to the shared
wrapper's signature is a change every caller sees, whether or not this spec
also updates that caller's own path-construction line. DB5 below makes the
scoping call this raises explicit rather than silently narrowing to the two
buckets the design doc happens to name.

### Resolved: storage RLS and path-prefixing ship together, same timeline

The handoff for this task asked this to be resolved explicitly, with
reasoning, rather than picked silently: **is storage-specific RLS meant to
land on the same timeline as this path-prefixing work, or is it a narrower
exception to ADR-0007's general "RLS is an additive net, deferred" stance?**

**Conclusion: same timeline, same deliverable — not a narrower exception,
and not a separate, later effort.** Three pieces of textual evidence, read
together, settle this rather than leaving it ambiguous:

1. **ADR-0007's own body** says, in its Consequences: "Org-claim RLS and
   storage-path prefixing become their own spec, joining spec A's six
   deferred items behind the same hard gate: no second `organizations` row
   until they land." This sentence puts storage-path prefixing *inside* the
   same gated list as org-claim RLS, under the same trigger — it does not
   describe storage RLS as optional, later, or narrower.
2. **Spec A's original deferred-item table** (`org-location-foundation/spec.md`)
   gives item 6's reason as: "Meaningless without the `storage.objects`
   policies it pairs with." This is the more specific and more decisive
   sentence: it isn't gesturing at RLS-in-general, it names
   `storage.objects` policies by their exact Postgres/Supabase Storage
   identity, and says prefixing alone accomplishes nothing without them.
   "Pairs with" is doing real work here — it describes one unit of work,
   not two on different clocks.
3. **Spec B2's own deferred register** lists "Org-claim RLS policies and the
   credential switch" and "Object-storage path prefixing" as two separate
   rows — but both carry the identical trigger, "before org #2." Distinct
   rows because they're different mechanisms to build (one governs
   ordinary tables, one governs the Storage bucket's backing table), not
   because one is due earlier or is optional relative to the other.

The mechanism is also the same one ADR-0007 already designed for ordinary
tables: the org-claim variant, where the backend authenticates as a
non-privileged role declaring its org and a policy compares an indexed
column against a constant — applied here to `storage.objects`, keyed on the
path prefix instead of a `org_id` column, because Supabase Storage objects
don't carry an application-defined `org_id` column, only a path. Practically,
this means: **shipping the path-prefixing migration in this section without
also shipping the `storage.objects` policies in the same section would
reproduce exactly the failure mode item 6's own reasoning warns about** — an
org-scoped path convention that no policy actually enforces, which is
cosmetic until the day the credential in front of it changes (the same
"additive right up until the credential switch, then all-or-nothing"
shape ADR-0007 describes for ordinary-table RLS). So Section B below designs
and ships both together.

### Solution (Section B)

1. **Path convention**, applied to new writes: HR documents at
   `{org_id}/{employeeId}/{id}/{safeName}`; invoice PDFs at
   `{org_id}/{timestamp}_{safeName}`. `org_id` as the leading path segment
   (not embedded elsewhere) is what the storage.objects RLS policy predicate
   below is written against — Supabase Storage policies read
   `storage.foldername(name)`, which splits the object path on `/` and
   returns it as an array, so the org id needs to be the first segment to
   be a cheap, index-free string-prefix comparison rather requiring a lookup
   elsewhere.
2. **Existing objects are not moved.** Confirmed and kept from D17's
   original reasoning: migrating every existing HR document and invoice PDF
   to a new path either breaks every stored `storage_path` /
   `attachmentUrl` value already in the database (HR docs keep the path in
   `hr_employee_documents.storage_path`; invoices keep the full public URL
   in whatever column stores `attachmentUrl`) or requires a data migration
   that copies every object and rewrites every reference — real risk for
   zero benefit while one organization exists. **New objects get the
   prefixed path from day one; existing objects keep their unprefixed path
   and are read exactly as today.** This is the same expand/no-contract
   shape spec A used elsewhere for schema defaults, except there is no
   "contract" phase planned here at all, because unlike a column default,
   there is no forcing mechanism (no query fails on an unprefixed path) —
   old objects simply stay how they are, forever, unless a future spec
   decides a backfill is worth its own cost.
3. **`storage.objects` RLS policies, org-claim variant**, scoped to the
   `hr-documents` and `invoice-documents` buckets: a `select`/`insert`/
   `update`/`delete` policy per bucket requiring
   `(storage.foldername(name))[1] = current_org()::text` (`current_org()`
   already exists or is trivially added alongside the JWT-claim function
   ADR-0007 designs for ordinary tables — reused here, not reinvented).
   **Objects with no `org_id` prefix segment fall outside every policy's
   predicate and are therefore unreadable and unwritable under the new
   policies** — which is fine for the app's own paths (it never reads
   Storage directly; `objectStorage`'s service-role client bypasses RLS
   entirely, same as every DB table today) but means these policies are the
   backstop, not the primary path, exactly matching ADR-0007's model:
   the helper (here, `objectStorage`) filters; the policy catches whatever
   skips it.
4. **The public `invoice-documents` bucket keeps its public-read policy for
   pre-existing objects, and prefixed new objects are additionally covered
   by the org-claim write/delete policies above.** A public bucket's `select`
   policy is moot for anyone holding a direct URL (§ above) — RLS here
   protects only administrative operations (listing the bucket, deleting or
   overwriting another org's object by guessing or enumerating a path), not
   read-by-URL. This is named explicitly so the policy design isn't
   mistaken for closing a hole it structurally cannot close.

### Implementation Decisions (Section B)

#### DB1 — Path convention keys on the leading segment, not a suffix or a separate table

Supabase's `storage.foldername()` helper exists specifically to make a
leading path segment cheap to compare in a policy predicate. Any other
convention (org id as a suffix, or a lookup join against
`storage.objects.metadata`) would need a per-row subquery in every policy —
against the same instinct ADR-0007 already rejected for ordinary tables
("compares an indexed column against a constant rather than running a
correlated subquery per query").

#### DB2 — No backfill of existing objects; the app never reads Storage directly, so nothing forces one

Rejected: rewriting every existing object's path and every stored reference
to it, in one migration. Two things make this safe to skip rather than a
compromise: first, D17's original point stands — the objects are opaque
blobs at rest, and copying them is real, non-mechanical migration risk
(large-file handling, partial-copy failure, orphaned references) for a
problem that cannot bite while one organization exists (the "single
organization" argument every other deferred item in this family already
rests on). Second, and specific to this section: because `objectStorage`'s
client is the service role and bypasses RLS entirely, the new
`storage.objects` policies never actually evaluate against the app's own
reads and writes — they exist purely as the backstop for anything that
someday queries Storage on a different credential. An unprefixed legacy
object is invisible to that backstop either way; it is not rendered *less*
safe by staying unprefixed, because nothing new is looking at it through
the policy layer.

#### DB3 — The public invoice bucket is not converted to signed URLs

Converting `invoice-documents` to a private bucket with signed URLs (mirroring
`hr-documents`) was considered, because it's the only way RLS-on-read would
actually mean something for this bucket. Rejected here as out of scope: it
changes a functional contract (every previously-issued public PDF URL a
customer has bookmarked, emailed, or printed stops resolving) for a decision
that belongs with whoever owns the invoice-delivery UX, not with the
narrow, mechanical character this spec is trying to keep. Recorded in
Further Notes' deferred register as a follow-up worth having, explicitly not
this spec's problem to solve.

#### DB4 — The other three buckets stay unprefixed and unpolicied, named as a deferred follow-up

`recurrence-documents`, `bank-statement-documents` and `invoice-imports`
share `objectStorage` with the two buckets this spec prefixes, and share the
identical hazard (no org segment, no policy). They are deliberately **not**
prefixed and **not** policied here — this spec keeps the scope the task and
the design doc's §2.6 point 3 actually named (HR documents, invoice PDFs),
rather than silently growing to "every bucket," which would turn a small,
narrow fix into a second sweeping-schema-style spec by another name. The
wrapper's signature change (an added organization parameter) reaches all
five callers regardless — the three excluded buckets simply pass it through
unused, exactly the shape `objectStorage`'s own header comment already used
once before ("gains an organization when the prefixing actually happens,
not before"): a parameter these three callers now receive but don't yet act
on, rather than one that's absent. Named explicitly in the deferred register
below so it isn't mistaken for an oversight.

Rejected: prefixing all five in this spec for consistency. The two named
buckets are the ones the design doc and the original gate item actually
call out, and there's no evidence the other three carry the same urgency —
`recurrence-documents` and `bank-statement-documents` are financial-adjacent
but not the fiscal-document class that made invoice PDFs and HR documents
(with its NIF/id-card/IBAN contents) the two the architecture doc singled
out. Growing scope on a hunch, inside a spec whose whole premise is staying
small, is the wrong trade.

#### DB5 — Recorded as a new ADR, not folded into ADR-0007

ADR-0007 already carries "app-level scoping is the boundary; RLS is a later,
additive net" as its subject, and its own Consequences section already
names storage-path prefixing as joining the same gate. What ADR-0007 does
not yet contain is the *design* — the path convention, the policy predicate,
the leave-old-objects-alone decision. That's genuinely new content, not an
amendment to an existing decision (compare: spec B2's ADR-0007 amendment
only corrected which enforcement criteria were actually met, it didn't
design anything new) — so it earns its own ADR, next available number
(`0015` — note `0010` is already double-allocated in this repo; check
before assigning). Title suggestion: "Storage-object RLS keys on the
leading path segment; existing objects are not backfilled."

### Testing Decisions (Section B)

Matching the standard `scoped-access/spec.md` set for the helper seam:

- **`objectStorage` wrapper (unit tests, extended):** once it takes an
  organization parameter, its existing shape (no database, PostgREST/Storage
  builder inspected before any request is made) extends directly — assert
  the upload path is prefixed, the signed-url and public-url paths accept
  an unprefixed legacy path unchanged (DB2), and a table/bucket combination
  outside the two known buckets is rejected the same way an unregistered
  database table is (mirrors B2's helper-registry test shape).
- **HR document and invoice use-case/service tests (existing, extended):**
  the organization threads through exactly as any other argument, per the
  existing test seams for `hrDocumentService.ts` and the invoices module's
  use cases — no new seam, matching B2's "existing use case seams,
  unchanged" precedent.
- **Policy verification (not a Jest suite — a written smoke, matching B1's
  and B2's own precedent for claims that only mean something against the
  real stack):** provision two organizations locally, upload one document
  per bucket per org, and confirm a request authenticated as org A's
  non-privileged storage role cannot list or fetch org B's *prefixed*
  object by path, while `objectStorage`'s own service-role path (the app's
  real, everyday path) keeps working unchanged for both.
- **Explicitly not built:** a Supabase-backed integration harness exercising
  real Storage HTTP calls end-to-end in CI — same reasoning as B2's D11,
  the risk here is "does the policy predicate say what we think," not
  "does Supabase Storage honor its own API."

---

## Out of Scope

- **The other four spec-A deferred items** (composite foreign keys, the
  ~65 remaining ones; composite `(org_id, …)` indexes; CRM text primary
  keys) — sibling specs, sequenced independently, sharing only the same
  gate.
- **Backfilling existing HR documents or invoice PDFs to prefixed paths**
  (DB2) — explicitly deferred, not this spec's problem, with no trigger
  recorded because nothing currently forces one.
- **Converting `invoice-documents` to a private, signed-URL bucket** (DB3) —
  a UX/product decision, not a mechanical tenancy fix.
- **A new short-lived, QR-specific credential type for the kiosk** (rejected
  in DA2) — reuses the existing paired device token instead.
- **Widening `requireDeviceAuthAllowingQueryParam` to other routes beyond
  whatever DA3 ultimately decides for kiosk/scan** — that decision is scoped
  narrowly to this one route if chosen at all, not a general reopening of
  D7's (location-credentials spec) query-param policy.
- **General org-claim RLS for ordinary database tables** — ADR-0007's
  Consequences criteria for that are B2's territory (already delivered) and
  not reopened here; this spec's RLS design is Storage-specific only.
- **The role taxonomy, seed template data, billing/plans/subdomains** —
  inherited unchanged from every prior spec in this family.

---

## Further Notes

### Deferred register

| Deferred | Why it can wait | Trigger |
|---|---|---|
| Backfilling existing unprefixed HR documents / invoice PDFs to the new path convention | Nothing reads Storage directly except the service-role `objectStorage` wrapper, which handles both conventions unchanged; the policies added here don't evaluate against it either way (DB2) | if/when a non-service-role Storage consumer is ever introduced |
| Converting `invoice-documents` to a private bucket with signed URLs | Changes a live functional contract (every previously-issued public URL); a product decision, not a mechanical fix (DB3) | whenever invoice-delivery UX is revisited |
| Widening kiosk's device-token transport to query-string (DA3 option a) | Only needed if the frontend-side read-and-reattach option (b) proves awkward in practice | if DA3 is later revisited |
| Prefixing and policying `recurrence-documents`, `bank-statement-documents`, `invoice-imports` (DB4) | Same wrapper, same hazard shape, but not the fiscal/personal-data class of document this spec's two named buckets are; deliberately excluded to keep this spec small (DB4) | whenever one of these three is judged to need the same treatment — no evidence yet that it's urgent |
| The other four spec-A deferred items (composite FKs, composite indexes, CRM primary keys) | Unrelated subsystems, own specs, same gate | before org #2, tracked in their own specs |

### Cross-repository contract

Section A is this spec's only contract-touching item. The QR-encoded URL
gains one query parameter (the paired device token); `KioskCheckinPage`
gains the logic to read it and present it on the `POST /kiosk/scan` call
(DA3 decides exactly how). No request or response *body* shape changes —
`GET /kiosk/daily-token` and `POST /kiosk/scan`'s existing payloads are
untouched. Per this repo's `CLAUDE.md`, this frontend change ships in the
same task as the backend piece it depends on (DA3's chosen transport, if
option (a) is picked) — if option (b) is chosen, the frontend change has no
backend dependency at all and can ship independently.

Section B has no cross-repository contract change: `objectStorage`'s new
organization parameter and the path convention are entirely internal to this
backend; no endpoint's request or response shape changes, and the frontend
never talks to Storage directly (it consumes signed URLs / public URLs the
backend already hands it, unchanged in shape).

### Risks

| Risk | Mitigation |
|---|---|
| The index migration (DA1) runs before confirming both PIN lookups are actually scoped in production, reintroducing D7's original hazard in reverse (an org-scoped index policing a lookup that turns out not to be scoped after all) | The re-confirmation test named in Section A's Testing Decisions runs first; the index migration is not gated on it structurally, so this is a process risk, not a code one — call it out at review time |
| DA3 is implemented as option (a) without the deliberate sign-off `device-auth-middleware.ts`'s own comment asks for, quietly widening query-string device-token transport beyond KDS | Name the decision explicitly in the implementation ticket, don't let it ride in as a one-line diff |
| The `storage.objects` policies (DB item 3) are written before the org-claim JWT function they depend on exists in this exact form for Storage (as opposed to the ordinary-table version B2 already built) | Verify `current_org()` (or equivalent) is callable from a Storage policy context before writing the policy SQL, not after |
| A future reader assumes the public invoice bucket is now access-controlled because it has RLS policies, and relies on that for something sensitive | DB3 and the Solution section's point 4 name this limitation explicitly; carried into the module's documentation, not left implicit in migration SQL comments alone |
| The other three `objectStorage` buckets (DB4) are forgotten precisely because this spec deliberately excludes them, and a later spec re-audits from scratch instead of reading this one's register | Named explicitly in the deferred register below, with the wrapper-signature-reaches-all-five-callers fact recorded so it isn't rediscovered |
| Section B's policies are written against buckets not yet confirmed to be the *only* two Storage buckets in use | Grep `supabase/migrations` and `src/infra/scoped-db/object-storage.ts`'s callers for bucket string literals before finalizing the policy list, the same way B2's registry enumerated every queried table before trusting a count |
