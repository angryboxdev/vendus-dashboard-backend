-- Página de Pizzas: receitas (versões por pizza; apenas 1 ativa por pizza)

create table if not exists public.pizza_recipes (
  id uuid primary key default gen_random_uuid(),
  pizza_id uuid not null references public.pizzas (id) on delete cascade,
  version int not null default 1,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (pizza_id, version)
);

comment on table public.pizza_recipes is 'Receitas (versões) por pizza; apenas uma is_active = true por pizza';

-- Apenas uma receita ativa por pizza
create unique index if not exists idx_pizza_recipes_one_active_per_pizza
  on public.pizza_recipes (pizza_id) where (is_active = true);

create index if not exists idx_pizza_recipes_pizza_id on public.pizza_recipes (pizza_id);

alter table public.pizza_recipes enable row level security;

create policy "Allow read for anon" on public.pizza_recipes for select using (true);
create policy "Allow insert for anon" on public.pizza_recipes for insert with check (true);
create policy "Allow update for anon" on public.pizza_recipes for update using (true);
create policy "Allow delete for anon" on public.pizza_recipes for delete using (true);
