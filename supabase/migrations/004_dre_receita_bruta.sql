-- DRE: receita bruta por ano/mês (3 categorias: dinheiro, tpa, apps)
-- Estrutura análoga a custos variáveis; campo taxa em vez de valor_sem_iva.

create table if not exists public.dre_receita_bruta (
  id uuid primary key default gen_random_uuid(),
  year smallint not null,
  month smallint not null,
  categoria text not null check (categoria in ('dinheiro', 'tpa', 'apps')),
  descricao text not null default '',
  valor numeric(12, 2) not null default 0,
  taxa numeric(12, 2) not null default 0,
  observacao text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.dre_receita_bruta is 'DRE: receita bruta por ano/mês (dinheiro, tpa, apps)';
comment on column public.dre_receita_bruta.categoria is 'dinheiro | tpa | apps';

create index if not exists idx_dre_receita_bruta_year_month
  on public.dre_receita_bruta (year, month);

alter table public.dre_receita_bruta enable row level security;

create policy "Allow read for anon"
  on public.dre_receita_bruta for select
  using (true);

create policy "Allow insert for anon"
  on public.dre_receita_bruta for insert
  with check (true);

create policy "Allow update for anon"
  on public.dre_receita_bruta for update
  using (true);

create policy "Allow delete for anon"
  on public.dre_receita_bruta for delete
  using (true);
