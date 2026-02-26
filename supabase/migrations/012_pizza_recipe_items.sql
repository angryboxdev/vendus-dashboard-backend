-- Página de Pizzas: ingredientes da receita por tamanho (quantidade na base_unit do stock_item)

create table if not exists public.pizza_recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.pizza_recipes (id) on delete cascade,
  stock_item_id uuid not null references public.stock_items (id) on delete restrict,
  size public.pizza_size not null,
  quantity numeric(14, 3) not null,
  waste_factor numeric(5, 4),
  is_optional boolean not null default false,
  created_at timestamptz default now(),
  unique (recipe_id, stock_item_id, size)
);

comment on table public.pizza_recipe_items is 'Ingredientes da receita por tamanho; quantity na base_unit do stock_items';
comment on column public.pizza_recipe_items.waste_factor is 'Ex: 0.05 para 5% de perda';

create index if not exists idx_pizza_recipe_items_recipe_id on public.pizza_recipe_items (recipe_id);
create index if not exists idx_pizza_recipe_items_stock_item_id on public.pizza_recipe_items (stock_item_id);

alter table public.pizza_recipe_items enable row level security;

create policy "Allow read for anon" on public.pizza_recipe_items for select using (true);
create policy "Allow insert for anon" on public.pizza_recipe_items for insert with check (true);
create policy "Allow update for anon" on public.pizza_recipe_items for update using (true);
create policy "Allow delete for anon" on public.pizza_recipe_items for delete using (true);
