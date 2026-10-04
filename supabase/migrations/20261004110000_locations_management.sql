-- Base Organizacional 1.0 — ticket 02 "Locais" (.scratch/base-organizacional).
--
-- `locations` passa a ser gerida pela aplicação (criar/editar/inativar),
-- deixando de depender só do script de provisioning. Nunca há hard delete:
-- um Local já usado continua referenciado por ~20 tabelas (FK compostas
-- `(org_id, location_id)`), e inativar só muda `is_active` — todas as
-- relações históricas continuam válidas.
--
-- `code` passa a opcional ("Código interno opcional" na task). A restrição
-- `unique (org_id, code)` mantém-se: em Postgres vários NULL não colidem.
-- Nenhum código lê `code` fora do provisioning (verificado em 2026-10-04).

alter table public.locations
  alter column code drop not null,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists municipality text,
  add column if not exists country text not null default 'PT',
  add column if not exists phone text;

-- Auditoria do módulo `locations` — tabela própria (decisão D3 da spec).
create table if not exists public.location_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  entity_type text not null check (entity_type in ('location')),
  entity_id uuid not null,
  action text not null,
  actor text not null,
  payload_before jsonb,
  payload_after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists location_audit_logs_entity_idx
  on public.location_audit_logs (org_id, entity_type, entity_id, created_at);

alter table public.location_audit_logs enable row level security;

drop policy if exists "location_audit_logs: org-scoped all" on public.location_audit_logs;
create policy "location_audit_logs: org-scoped all"
  on public.location_audit_logs
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
