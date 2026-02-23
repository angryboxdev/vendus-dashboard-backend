-- DRE: custos fixos por ano/mês (lista única, sem categoria)
-- Mesmos campos que custos variáveis exceto categoria.

create table if not exists public.dre_custos_fixos (
  id uuid primary key default gen_random_uuid(),
  year smallint not null,
  month smallint not null,
  descricao text not null default '',
  valor numeric(12, 2) not null default 0,
  valor_sem_iva numeric(12, 2) not null default 0,
  observacao text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.dre_custos_fixos is 'DRE: custos fixos por ano/mês (lista única)';

create index if not exists idx_dre_custos_fixos_year_month
  on public.dre_custos_fixos (year, month);

alter table public.dre_custos_fixos enable row level security;

create policy "Allow read for anon"
  on public.dre_custos_fixos for select
  using (true);

create policy "Allow insert for anon"
  on public.dre_custos_fixos for insert
  with check (true);

create policy "Allow update for anon"
  on public.dre_custos_fixos for update
  using (true);

create policy "Allow delete for anon"
  on public.dre_custos_fixos for delete
  using (true);
