-- Fase 2 (Fecho mensal): 1 fecho por (organização, ano, mês) — por
-- organização inteira, não por local (confirmado com o utilizador).
-- Único ponto de verdade para "este período está fechado"; qualquer
-- escrita de correção de assiduidade passa a verificar esta tabela.

create table if not exists public.hr_monthly_closures (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  year            integer not null,
  month           integer not null check (month between 1 and 12),
  status          text not null default 'open' check (status in ('open', 'closed')),
  closed_by       text,
  closed_at       timestamptz,
  reopened_by     text,
  reopened_at     timestamptz,
  reopen_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint hr_monthly_closures_org_year_month_key unique (org_id, year, month)
);

comment on table public.hr_monthly_closures is
  'Fecho mensal de assiduidade (Fase 2) — 1 linha por (org, ano, mês); ausência de linha = período em aberto por omissão.';

create index if not exists hr_monthly_closures_org_id_idx on public.hr_monthly_closures (org_id);

alter table public.hr_monthly_closures enable row level security;
