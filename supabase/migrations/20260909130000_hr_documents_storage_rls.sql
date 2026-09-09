-- storage.objects RLS for the "hr-documents" bucket (ticket 04 of
-- .scratch/kiosk-pin-storage-prefix/spec.md Section B; design recorded in
-- docs/adr/0015-storage-object-rls-leading-path-segment-no-backfill.md).
--
-- current_org() is the org-claim JWT function ADR-0007 designs for
-- ordinary tables ("org_id = current_org()"), reused unchanged here against
-- Storage's own path-based shape (ADR-0015 DB1): Storage objects carry no
-- org_id column, only a path, so the policy predicate reads the leading
-- `storage.foldername(name)` segment instead of a column. It resolves the
-- `org_id` claim the token hook (20260825120000_org_members_and_token_hook.sql)
-- already injects for any authenticated user holding exactly one
-- organization membership -- no new claim, no new hook.
--
-- This function is shared infrastructure: ticket 05 (invoice-documents)
-- reuses it unchanged rather than redefining it. `create or replace` makes
-- re-running this migration (or a future one that also declares it) a
-- no-op rather than an error.
--
-- This is additive, not the credential switch ADR-0007 describes as the
-- one non-additive step: `objectStorage`'s own client is the service role
-- and bypasses every policy below entirely, same as every DB table today.
-- These policies are the backstop for a future caller on a non-privileged
-- credential -- they do not evaluate against the app's own reads/writes,
-- and an existing unprefixed legacy object (ADR-0015 DB2) simply falls
-- outside every predicate here, exactly as designed.

create or replace function public.current_org()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'org_id', '')::uuid;
$$;

-- storage.objects ships with row level security already enabled by
-- Supabase's own baseline (owned by supabase_storage_admin; `postgres` is
-- not the owner and cannot re-run `alter table ... enable row level
-- security` here, confirmed against the local stack) -- only the policies
-- below are this migration's job.

create policy "hr-documents: org-scoped select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'hr-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "hr-documents: org-scoped insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'hr-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "hr-documents: org-scoped update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'hr-documents'
    and (storage.foldername(name))[1] = current_org()::text
  )
  with check (
    bucket_id = 'hr-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );

create policy "hr-documents: org-scoped delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'hr-documents'
    and (storage.foldername(name))[1] = current_org()::text
  );
