-- Página de Pizzas: tabela pizzas

create type public.pizza_category as enum (
  'classics', 'specials', 'sweeties'
);

create table if not exists public.pizzas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category public.pizza_category not null,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.pizzas is 'Pizzas (classics, specials, sweeties)';
comment on column public.pizzas.category is 'classics | specials | sweeties';

create index if not exists idx_pizzas_category on public.pizzas (category);
create index if not exists idx_pizzas_is_active on public.pizzas (is_active);

alter table public.pizzas enable row level security;

create policy "Allow read for anon" on public.pizzas for select using (true);
create policy "Allow insert for anon" on public.pizzas for insert with check (true);
create policy "Allow update for anon" on public.pizzas for update using (true);
create policy "Allow delete for anon" on public.pizzas for delete using (true);
