# 04 — HR documents: org-prefixed paths + RLS policies (`hr-documents`)

**What to build:** New HR employee document uploads write to
`{org_id}/{employeeId}/{id}/{safeName}` instead of today's
`{employeeId}/{id}/{safeName}`. Existing objects are left exactly as they
are — no backfill (DB2), read unchanged via the existing app-level
ownership check ahead of the signed URL. `storage.objects`
select/insert/update/delete policies for the `hr-documents` bucket, keyed on
`(storage.foldername(name))[1] = current_org()::text` (the org-claim
variant), land in the same ticket — path-prefixing without the policy is
explicitly the failure mode this spec avoids.

See `.scratch/kiosk-pin-storage-prefix/spec.md` Section B (Solution points
1–3, Testing Decisions) for the full reasoning.

**Blocked by:** 03 (needs the `objectStorage` org parameter and the ADR's
policy design).

**Status:** done and verified

- [x] `hrDocumentService.ts`'s `uploadDocument` writes new objects to
      `{org_id}/{employeeId}/{id}/{safeName}`. (Already true as of ticket
      03's caller-threading change — `uploadDocument` passes
      `organizationId` to `objectStorage.upload`, and `hr-documents` is
      opted into `prefixByOrganization` in `STORAGE_BUCKET_REGISTRY` — this
      ticket verified it, added the regression tests, and shipped the
      policies that make the prefix load-bearing.)
- [x] Existing HR documents keep resolving via `getDocumentSignedUrl`
      unchanged; no path rewrite, no data migration. (Also already true via
      ticket 03 — `createSignedUrl` never rewrites the path it's given.)
- [x] `storage.objects` select/insert/update/delete policies added for
      `hr-documents`, keyed on the leading path segment via
      `storage.foldername`. New migration:
      `supabase/migrations/20260909130000_hr_documents_storage_rls.sql`
      (also defines `current_org()`, shared with ticket 05).
- [x] `hrDocumentService.ts` tests extended: organization threads through
      the upload call like any other argument. New file (none existed
      before): `src/services/__tests__/hrDocumentService.test.ts`.
- [x] Written smoke verification (not a Jest suite): two local
      organizations, one document each; org A's non-privileged storage role
      cannot list or fetch org B's prefixed object; `objectStorage`'s own
      service-role path keeps working unchanged for both. See
      `04-smoke-verification.md` in this directory — run for real against
      the local Supabase stack.
