-- Base Organizacional 1.0 — ticket 01 "Empresa" (.scratch/base-organizacional).
--
-- A "Empresa" da task é a `Organization` já existente (CONTEXT.md: uma linha
-- por entidade legal, um NIF) — expande-se esta tabela, nunca se cria uma
-- entidade "Company" paralela. `name` passa a ser o "Nome comercial" e
-- `address` a "Morada fiscal" (mesmas colunas, sem migração de dados).
--
-- Todas as colunas novas são nullable (ou com default) — as organizações já
-- provisionadas continuam válidas; o perfil completa-se pela UI.

alter table public.organizations
  add column if not exists legal_name text,
  add column if not exists niss text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text not null default 'PT',
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists timezone text not null default 'Europe/Lisbon',
  add column if not exists logo_storage_path text,
  add column if not exists status text not null default 'active';

alter table public.organizations
  drop constraint if exists organizations_status_check;
alter table public.organizations
  add constraint organizations_status_check check (status in ('active', 'inactive'));

-- Auditoria do módulo `organization` — tabela própria, mesma forma de
-- `accounting_audit_logs`/`stock_count_audit_logs` (decisão D3 da spec).
create table if not exists public.organization_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  entity_type text not null check (entity_type in ('organization')),
  entity_id uuid not null,
  action text not null,
  actor text not null,
  payload_before jsonb,
  payload_after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists organization_audit_logs_entity_idx
  on public.organization_audit_logs (org_id, entity_type, entity_id, created_at);

alter table public.organization_audit_logs enable row level security;

drop policy if exists "organization_audit_logs: org-scoped all" on public.organization_audit_logs;
create policy "organization_audit_logs: org-scoped all"
  on public.organization_audit_logs
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

-- Logotipo da organização — bucket privado, prefixo `{org_id}/` (ADR-0015),
-- servido por URL assinado como as fotos de `hr-photos`.
insert into storage.buckets (id, name, public)
values ('organization-assets', 'organization-assets', false)
on conflict (id) do nothing;

drop policy if exists "organization-assets: org-scoped select" on storage.objects;
create policy "organization-assets: org-scoped select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'organization-assets'
    and (storage.foldername(name))[1] = current_org()::text
  );

drop policy if exists "organization-assets: org-scoped insert" on storage.objects;
create policy "organization-assets: org-scoped insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'organization-assets'
    and (storage.foldername(name))[1] = current_org()::text
  );

drop policy if exists "organization-assets: org-scoped update" on storage.objects;
create policy "organization-assets: org-scoped update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'organization-assets'
    and (storage.foldername(name))[1] = current_org()::text
  )
  with check (
    bucket_id = 'organization-assets'
    and (storage.foldername(name))[1] = current_org()::text
  );

drop policy if exists "organization-assets: org-scoped delete" on storage.objects;
create policy "organization-assets: org-scoped delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'organization-assets'
    and (storage.foldername(name))[1] = current_org()::text
  );
