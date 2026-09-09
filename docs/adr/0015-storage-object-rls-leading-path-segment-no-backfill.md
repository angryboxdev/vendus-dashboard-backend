# Storage-object RLS keys on the leading path segment; existing objects are not backfilled

Settles the design ADR-0007's Consequences promised but did not itself carry:
`.scratch/kiosk-pin-storage-prefix/spec.md` Section B (DB1, DB2, DB5). This
records the design; the `storage.objects` policy migration and the app-side
prefixing that makes it meaningful ship together, in a later ticket of the
same spec — see Consequences below for what that ticket must do.

**Path convention keys on the leading segment (DB1).** New writes to an
opted-in bucket get `org_id` as the *first* path segment —
`{org_id}/{employeeId}/{id}/{safeName}` for HR documents,
`{org_id}/{timestamp}_{safeName}` for invoice PDFs — not a suffix, and not a
lookup against `storage.objects.metadata`. Supabase Storage policies read
`storage.foldername(name)`, which splits an object's path on `/`; a leading
segment is what turns the RLS predicate into a cheap, index-free string
comparison, `(storage.foldername(name))[1] = current_org()::text`, rather
than a per-row correlated subquery. This is the same instinct ADR-0007
already applied to ordinary tables (an indexed column compared against a
constant) — carried here to a store that has no `org_id` column at all, only
a path, so the path has to carry it.

`current_org()` is the org-claim JWT function ADR-0007 designs for ordinary
tables, reused unchanged: the backend authenticates as a non-privileged role
declaring its org, and the policy compares against that claim. Nothing new is
invented for Storage beyond pointing the same function at
`storage.foldername(name)[1]` instead of a column.

Scope is deliberately two buckets, not all five sharing the wrapper:
`hr-documents` and `invoice-documents` are the fiscal-document class
(NIF/id-card/IBAN contents, permanent public PDF URLs) the architecture
doc's deferred-item list names. `recurrence-documents`,
`bank-statement-documents` and `invoice-imports` stay unprefixed and
unpolicied for now — named explicitly as a deferred follow-up, not an
oversight, because there's no evidence they carry the same urgency and
growing scope on a hunch is the wrong trade inside a spec whose premise is
staying small.

**Existing objects are not backfilled (DB2).** New objects get the prefixed
path from day one; every object written before this ships keeps its
unprefixed path and is read exactly as today — HR docs via
`hr_employee_documents.storage_path`, invoice PDFs via the full public URL
stored as `attachmentUrl`. Rewriting every existing object's path and every
stored reference to it was rejected: the objects are opaque blobs at rest, so
copying them is real, non-mechanical migration risk (large-file handling,
partial-copy failure, orphaned references) for a problem that cannot bite
while one organization exists. There is no contract phase planned to follow,
unlike a column default — nothing ever forces an old object to move, because
nothing ever fails on an unprefixed path. A future spec can decide a backfill
is worth its own cost; this one doesn't need to.

This is safe specifically because the app never reads Storage through the
policy layer: `objectStorage`'s client is the service role and bypasses RLS
entirely, same as every DB table today. The new `storage.objects` policies
never evaluate against the app's own reads and writes — they exist purely as
the backstop for a future caller on a different credential. An unprefixed
legacy object is invisible to that backstop either way; leaving it unprefixed
doesn't make it less safe, because nothing new is looking at it through the
policy layer.

**The public `invoice-documents` bucket is not converted to signed URLs.**
That would be the only way RLS-on-read means anything for a bucket anyone
holding a direct URL can already read forever — but it changes a functional
contract (every previously-issued public PDF URL a customer bookmarked,
emailed, or printed stops resolving), which belongs with whoever owns
invoice-delivery UX, not with this narrow, mechanical change. The bucket
keeps its public-read policy for pre-existing objects; the org-claim
write/delete policies above additionally cover prefixed new objects. RLS here
protects administrative operations (listing the bucket, deleting or
overwriting another org's object by guessing or enumerating a path) — not
read-by-URL, which no policy design can close for a public bucket.

**Recorded as its own ADR, not folded into ADR-0007 (DB5).** ADR-0007
already names storage-path prefixing as joining its own deferred gate — that
sentence is why this is due now, not later, not a narrower exception — but
it never designed *how*: the path convention, the policy predicate, the
leave-old-objects-alone decision. That's new content, not a correction to
what ADR-0007 already decided, so it gets a new number instead of an
amendment section.

## Consequences

Building on this ADR, the app-side foundation ships first
(`src/infra/scoped-db/object-storage.ts`): `upload` prefixes a new object's
path with the caller's organization for an opted-in bucket and returns the
actual path written, so the caller persists the real, resolved path; `getPublicUrl`
and `createSignedUrl` never rewrite the path they're given, so an existing
unprefixed reference keeps resolving unchanged. A bucket outside the
registered set is a compile error, mirroring how an unregistered table is
rejected by the scoped-query helper's `TableName` union.

The `storage.objects` policy migrations have since shipped, both buckets, on
the timeline this ADR and ADR-0007 committed to (before organization #2):
`supabase/migrations/20260909130000_hr_documents_storage_rls.sql` (ticket 04,
`hr-documents`) and `supabase/migrations/20260909140000_invoice_documents_storage_rls.sql`
(ticket 05, `invoice-documents`). Both end up with the same four operations
— select/insert/update/delete — even though `invoice-documents` is public
and the Solution section above only asked for write/delete there: a bare
DELETE (or UPDATE) policy with no accompanying SELECT-granting policy for
the same role deletes/updates **zero rows unconditionally, including a
legitimately matching same-org row** — confirmed empirically against an
isolated probe table and against `storage.objects` itself (ticket 05's
smoke, Deviation 1) before shipping the fix. This is a general Postgres RLS
mechanic (UPDATE/DELETE need the target row to already be SELECT-visible
before their own USING clause is even consulted), not something specific to
Storage — omitting the select policy would have shipped a delete policy that
silently never deletes anything, for any organization, which is worse than
no policy because it reads as protection while being inert. Adding it grants
no new read exposure for `invoice-documents` (see the next paragraph): the
bucket already serves any object to anyone regardless of RLS, so an
org-scoped select policy only ever helps this bucket's own write/delete
policies function, never widens what a reader can reach.

**A held URL — or, for `invoice-documents` specifically, an authenticated
`.download()` call — is unaffected by any of this, confirmed empirically at
smoke time (ticket 05's smoke, Deviation 2).** For a public bucket, Supabase
Storage serves an object through both its direct public URL and the SDK's
`.download()` call without evaluating `storage.objects` RLS at all — the
select policy above exists solely for the DELETE/UPDATE visibility mechanic
just described, not to gate reads, which this bucket structurally cannot do
while it stays public (DB3, out of scope). `hr-documents` is private and has
no equivalent exposure: its signed URLs expire in 120 seconds and its own
select policy is the real read gate for anything going through Storage
directly. A future reader must not assume `invoice-documents` having RLS
policies at all means reads are access-controlled — they are not, for either
transport.

Related: `docs/adr/0007-app-level-scoping-is-the-tenant-boundary.md` (the
org-claim mechanism and the deferred-item gate this belongs to),
`docs/adr/0008-scoped-query-helper-is-the-sole-construction-site.md` (the
sibling helper this pattern mirrors for ordinary tables),
`.scratch/kiosk-pin-storage-prefix/spec.md` Section B (Problem Statement,
Solution, DB1–DB5, Testing Decisions).
