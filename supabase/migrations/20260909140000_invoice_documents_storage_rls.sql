-- storage.objects RLS for the "invoice-documents" bucket (ticket 05 of
-- .scratch/kiosk-pin-storage-prefix/spec.md Section B; design recorded in
-- docs/adr/0015-storage-object-rls-leading-path-segment-no-backfill.md).
--
-- invoice-documents is a PUBLIC bucket: existing (and new) objects are still
-- served through Supabase Storage's public-read route regardless of these
-- policies -- confirmed against the local stack that this holds even for
-- .download() called with an authenticated org-scoped session, not only the
-- direct getPublicUrl route. Nothing below closes that; see ADR-0015 and
-- src/modules/invoices/README.md for the limitation spelled out in full.
--
-- DEVIATION from the ticket's literal "write/delete policies only" wording:
-- an org-scoped SELECT policy is included too, even though it grants no new
-- read exposure (the bucket already serves any object publicly regardless
-- of RLS, proven above). It is required for UPDATE/DELETE to function AT
-- ALL, for anyone, including the object's own org: verified empirically
-- against the local stack (an isolated probe table, and this bucket
-- directly) that a bare DELETE-with-USING policy and no accompanying
-- SELECT policy deletes zero rows unconditionally -- not just for a
-- cross-org path, but for a matching, same-org path too. Postgres's RLS for
-- UPDATE/DELETE needs the target row to already be visible under some
-- SELECT-granting policy before its own USING clause is even consulted; a
-- command-specific policy alone does not supply that visibility. Omitting
-- the SELECT policy here would have shipped a delete policy that silently
-- never deletes anything, for any organization -- worse than no policy,
-- because it would read as "protected" while being merely inert. This
-- matches ticket 04's hr-documents shape (which already carries all four
-- operations) rather than diverging from it.
--
-- current_org() is NOT redefined here: it already exists, created by
-- 20260909130000_hr_documents_storage_rls.sql, and is shared, unmodified
-- infrastructure -- this migration only depends on it running first
-- (guaranteed by the earlier timestamp).
--
-- Additive only: objectStorage's own client is the service role and
-- bypasses every policy below entirely, same as hr-documents (ticket 04)
-- and every DB table today.

create policy "invoice-documents: org-scoped select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'invoice-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "invoice-documents: org-scoped insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'invoice-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "invoice-documents: org-scoped update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'invoice-documents'
    and (storage.foldername(name))[1] = current_org()::text
  )
  with check (
    bucket_id = 'invoice-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "invoice-documents: org-scoped delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'invoice-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );
