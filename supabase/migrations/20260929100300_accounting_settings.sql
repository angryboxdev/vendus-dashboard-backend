-- Periodicidade de IVA configurável por organização (secção 11 da task —
-- "não hardcode trimestre"). 1 linha por organização; ausência de linha
-- = "quarterly" por omissão (mesmo comportamento da Fase 1, preservado).

create table if not exists public.accounting_settings (
  org_id uuid primary key references public.organizations(id),
  vat_periodicity text not null default 'quarterly' check (vat_periodicity in ('monthly', 'quarterly')),
  updated_at timestamptz not null default now()
);

alter table public.accounting_settings enable row level security;

create policy "accounting_settings: org-scoped all"
  on public.accounting_settings
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());
