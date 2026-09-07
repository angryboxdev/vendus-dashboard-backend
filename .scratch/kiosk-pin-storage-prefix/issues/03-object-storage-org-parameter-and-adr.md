# 03 — `objectStorage` wrapper takes an organization parameter + ADR-0015

**What to build:** The shared `objectStorage` wrapper
(`src/infra/scoped-db/object-storage.ts`, the sole allowed Storage
construction site) gains an organization parameter on its signature. All 5
current callers pass it through: `hr-documents` and `invoice-documents`
will act on it in tickets 04/05; `recurrence-documents`,
`bank-statement-documents`, and `invoice-imports` pass it through unused for
now (DB4 — deliberately out of scope for prefixing/policies in this spec).

Alongside the code change, write ADR-0015 recording the design this
foundation enables: the path convention (leading `org_id` path segment, not
a suffix or a separate table — DB1), the org-claim policy predicate against
`storage.foldername(name)[1]`, and the decision not to backfill existing
objects (DB2). Confirm `0015` is free before assigning (`0010` is already
double-allocated in this repo).

See `.scratch/kiosk-pin-storage-prefix/spec.md` Section B (Problem
Statement, Solution, DB1/DB2/DB5, Testing Decisions) for the full reasoning.

**Blocked by:** None — can start immediately. Independent of Section A.

**Status:** ready-for-agent

- [ ] `objectStorage`'s upload/signed-url/public-url functions accept an
      organization parameter.
- [ ] All 5 callers updated to pass it (3 pass through unused, matching
      DB4).
- [ ] Existing `objectStorage` unit tests extended: the upload path is
      prefixed when a bucket opts in, signed-url/public-url paths accept an
      unprefixed legacy path unchanged, and a bucket outside the
      to-be-prefixed set is rejected the same way an unregistered table is.
- [ ] `docs/adr/0015-*.md` written, covering the path convention, the
      `storage.foldername`-keyed policy predicate, and the no-backfill
      decision. Title: "Storage-object RLS keys on the leading path
      segment; existing objects are not backfilled."
