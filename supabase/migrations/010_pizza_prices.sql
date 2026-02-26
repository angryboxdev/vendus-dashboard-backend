-- Página de Pizzas: preço por tamanho (small / large)

create type public.pizza_size as enum (
  'small', 'large'
);

create table if not exists public.pizza_prices (
  id uuid primary key default gen_random_uuid(),
  pizza_id uuid not null references public.pizzas (id) on delete cascade,
  size public.pizza_size not null,
  price numeric(10, 2) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (pizza_id, size)
);

comment on table public.pizza_prices is 'Preço por tamanho (small/large) por pizza';

create index if not exists idx_pizza_prices_pizza_id on public.pizza_prices (pizza_id);

alter table public.pizza_prices enable row level security;

create policy "Allow read for anon" on public.pizza_prices for select using (true);
create policy "Allow insert for anon" on public.pizza_prices for insert with check (true);
create policy "Allow update for anon" on public.pizza_prices for update using (true);
create policy "Allow delete for anon" on public.pizza_prices for delete using (true);
