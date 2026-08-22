-- DRE: custos variáveis por ano/mês (Angry Box)
-- Cada linha é um item de custo (producao ou venda) para um dado year/month.
-- Pode ser inspecionado e editado pela UI do Supabase (Table Editor).

create table if not exists public.dre_custos_variaveis (
  id uuid primary key default gen_random_uuid(),
  year smallint not null,
  month smallint not null,
  categoria text not null check (categoria in ('producao', 'venda')),
  item_id text not null,
  descricao text not null default '',
  valor numeric(12, 2) not null default 0,
  valor_sem_iva numeric(12, 2) not null default 0,
  observacao text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (year, month, categoria, item_id)
);

comment on table public.dre_custos_variaveis is 'DRE: custos variáveis por ano/mês (producao e venda)';
comment on column public.dre_custos_variaveis.item_id is 'Identificador do item para o frontend';
comment on column public.dre_custos_variaveis.categoria is 'producao | venda';

create index if not exists idx_dre_custos_variaveis_year_month
  on public.dre_custos_variaveis (year, month);

-- RLS: permitir leitura/escrita com anon key (ajustar depois se usar auth)
alter table public.dre_custos_variaveis enable row level security;

create policy "Allow read for anon"
  on public.dre_custos_variaveis for select
  using (true);

create policy "Allow insert for anon"
  on public.dre_custos_variaveis for insert
  with check (true);

create policy "Allow update for anon"
  on public.dre_custos_variaveis for update
  using (true);

create policy "Allow delete for anon"
  on public.dre_custos_variaveis for delete
  using (true);
