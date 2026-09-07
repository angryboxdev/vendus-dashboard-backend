# 05 — Invoice PDFs: org-prefixed paths + RLS policies (`invoice-documents`)

**What to build:** New invoice PDF uploads write to
`{org_id}/{timestamp}_{safeName}` instead of today's
`{timestamp}_{safeName}`. Existing objects and their already-issued public
URLs are left exactly as they are — no backfill (DB2), no conversion to
signed URLs (DB3, out of scope). `storage.objects` write/delete policies
for `invoice-documents` land in the same ticket, keyed on
`(storage.foldername(name))[1] = current_org()::text`; the bucket's public
read policy for pre-existing objects is preserved unchanged. Document
explicitly (module docs, not just migration SQL comments) that these
policies protect administrative operations (listing, guessing/overwriting
another org's path) but do nothing for a URL someone already holds — a
public bucket's read exposure is unchanged and out of this spec's reach.

See `.scratch/kiosk-pin-storage-prefix/spec.md` Section B (Solution point 4,
DB3, Testing Decisions, Risks) for the full reasoning.

**Blocked by:** 03 (needs the `objectStorage` org parameter and the ADR's
policy design).

**Status:** ready-for-agent

- [ ] Invoice PDF upload writes new objects to
      `{org_id}/{timestamp}_{safeName}`.
- [ ] Existing invoice PDFs and their stored public URLs keep resolving
      unchanged; no path rewrite, no data migration, bucket stays public.
- [ ] `storage.objects` write/delete policies added for
      `invoice-documents`, keyed on the leading path segment; existing
      public-read policy untouched.
- [ ] Invoices module use-case tests extended: organization threads through
      the upload call like any other argument.
- [ ] Written smoke verification (not a Jest suite): two local
      organizations, one PDF each; org A's non-privileged storage role
      cannot list, overwrite, or delete org B's prefixed object by path;
      `objectStorage`'s own service-role path keeps working unchanged for
      both.
- [ ] The "RLS here doesn't protect a URL someone already holds" limitation
      is documented explicitly (module README / ADR-0015), not left
      implicit.
