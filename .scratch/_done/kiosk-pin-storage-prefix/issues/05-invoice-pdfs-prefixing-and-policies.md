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

**Status:** done and verified

- [x] Invoice PDF upload writes new objects to
      `{org_id}/{timestamp}_{safeName}`. (Already true as of ticket 03's
      caller-threading change — `ImportInvoiceUseCase` passes
      `command.organizationId` to `DocumentStoragePort.store`, which reaches
      `objectStorage.upload`, and `invoice-documents` is opted into
      `prefixByOrganization` in `STORAGE_BUCKET_REGISTRY` — this ticket
      verified it and shipped the policies that make the prefix load-bearing.)
- [x] Existing invoice PDFs and their stored public URLs keep resolving
      unchanged; no path rewrite, no data migration, bucket stays public.
      (Also already true via ticket 03 — `getPublicUrl` never rewrites the
      path it's given.)
- [x] `storage.objects` policies added for `invoice-documents`, keyed on the
      leading path segment. New migration:
      `supabase/migrations/20260909140000_invoice_documents_storage_rls.sql`
      (reuses `current_org()` from ticket 04's migration, does not
      redefine it). **Deviation from this ticket's literal "write/delete
      policies" wording: a select policy was added too** — required for
      the delete/update policies to actually delete/update anything at all
      (a general Postgres RLS mechanic, not specific to Storage; see the
      migration's own comment and `05-smoke-verification.md` Deviation 1 for
      the empirical proof). It grants no new read exposure: the bucket's
      existing public-read behaviour (untouched) already bypasses RLS for
      reads entirely, confirmed in the same smoke (Deviation 2).
- [x] Invoices module use-case tests extended: organization threads through
      the upload call like any other argument. Already covered by ticket
      03's changes to `import-invoice.use-case.ts`,
      `import-invoice.test.ts`, `fake-document-storage.port.ts`, and
      `src/infra/scoped-db/__tests__/object-storage.test.ts` (asserts
      `invoice-documents` prefixing specifically) — re-run and confirmed
      green as part of this ticket, no further seam needed.
- [x] Written smoke verification (not a Jest suite): two local
      organizations, one PDF each; org A's non-privileged storage role
      cannot list, overwrite, or actually delete org B's prefixed object by
      path; `objectStorage`'s own service-role path keeps working unchanged
      for both. See `05-smoke-verification.md` in this directory — run for
      real against the local Supabase stack, 15/15 checks passed.
- [x] The "RLS here doesn't protect a URL someone already holds" limitation
      is documented explicitly: `docs/adr/0015-storage-object-rls-leading-path-segment-no-backfill.md`
      (Consequences section) and `src/modules/invoices/README.md`
      ("Decisões de design" and "Pontos de atenção" sections) — both now
      also note the stronger finding that an *authenticated* `.download()`
      call bypasses RLS too, not only the direct public URL.
