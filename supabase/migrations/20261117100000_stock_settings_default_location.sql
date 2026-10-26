-- Localização principal do Stock por empresa (task V5 §2.4): as entradas das faturas vão para esta loja
-- sem perguntar o destino. Com uma só loja ativa usa-se essa; com várias e sem localização principal,
-- a entrada fica bloqueada até a configurar (nunca se escolhe uma loja ao acaso). Tabela nova,
-- org-scoped, uma linha por empresa. Idempotente.
-- Rollback: docs/migrations/rollback/20261117100000_stock_settings_default_location.sql

create table if not exists public.stock_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  default_location_id uuid null,
  updated_by text null,
  updated_at timestamptz not null default now(),
  constraint stock_settings_org_key unique (org_id),
  constraint stock_settings_default_location_fk foreign key (org_id, default_location_id)
    references public.locations (org_id, id) on delete set null (default_location_id)
);

alter table public.stock_settings enable row level security;

drop policy if exists "stock_settings: org-scoped all" on public.stock_settings;
create policy "stock_settings: org-scoped all"
  on public.stock_settings
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

comment on table public.stock_settings is 'Definições do Stock por empresa (localização principal das entradas de faturas).';

-- Auditoria das alterações na tabela de auditoria do módulo.
alter table public.stock_review_audit_logs drop constraint if exists stock_review_audit_logs_entity_type_check;
alter table public.stock_review_audit_logs
  add constraint stock_review_audit_logs_entity_type_check check (entity_type in ('stock_purchase_review', 'purchase_presentation', 'stock_entry_rules', 'stock_settings'));
