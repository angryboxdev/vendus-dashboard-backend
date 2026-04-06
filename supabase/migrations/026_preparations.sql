-- Fichas Técnicas: preparos (sub-receitas) e seus ingredientes.
-- Um preparo tem os seus próprios stock_items e produz uma quantidade conhecida (yield_qty/yield_unit).
-- Uma linha de receita de pizza pode apontar para um preparo em vez de um stock_item diretamente.

-- -----------------------------------------------------------------------
-- 1. Tabela de preparos
-- -----------------------------------------------------------------------
create table public.preparations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  yield_qty    numeric(14, 3) not null check (yield_qty > 0),
  yield_unit   text not null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

comment on table public.preparations is 'Fichas técnicas (sub-receitas): produzem yield_qty/yield_unit a partir de ingredientes de stock';
comment on column public.preparations.yield_qty is 'Quantidade produzida pela receita (ex: 500)';
comment on column public.preparations.yield_unit is 'Unidade do output (ex: g, ml, un)';

alter table public.preparations enable row level security;
create policy "Allow read for anon"   on public.preparations for select using (true);
create policy "Allow insert for anon" on public.preparations for insert with check (true);
create policy "Allow update for anon" on public.preparations for update using (true);
create policy "Allow delete for anon" on public.preparations for delete using (true);

-- -----------------------------------------------------------------------
-- 2. Ingredientes de cada preparo
-- -----------------------------------------------------------------------
create table public.preparation_items (
  id               uuid primary key default gen_random_uuid(),
  preparation_id   uuid not null references public.preparations (id) on delete cascade,
  stock_item_id    uuid not null references public.stock_items (id) on delete restrict,
  quantity         numeric(14, 3) not null check (quantity > 0),
  created_at       timestamptz default now(),
  unique (preparation_id, stock_item_id)
);

comment on table public.preparation_items is 'Ingredientes de cada preparo; quantity na base_unit do stock_item';

create index if not exists idx_preparation_items_preparation_id on public.preparation_items (preparation_id);
create index if not exists idx_preparation_items_stock_item_id  on public.preparation_items (stock_item_id);

alter table public.preparation_items enable row level security;
create policy "Allow read for anon"   on public.preparation_items for select using (true);
create policy "Allow insert for anon" on public.preparation_items for insert with check (true);
create policy "Allow update for anon" on public.preparation_items for update using (true);
create policy "Allow delete for anon" on public.preparation_items for delete using (true);

-- -----------------------------------------------------------------------
-- 3. Alterar pizza_recipe_items: stock_item_id nullable + preparation_id
-- -----------------------------------------------------------------------
alter table public.pizza_recipe_items
  alter column stock_item_id drop not null,
  add column preparation_id uuid references public.preparations (id) on delete restrict;

-- Remover constraint única original (só cobria stock_item_id)
alter table public.pizza_recipe_items
  drop constraint if exists pizza_recipe_items_recipe_id_stock_item_id_size_key;

-- Unicidade parcial: um stock item só pode aparecer uma vez por (recipe, size)
create unique index pizza_recipe_items_stock_unique
  on public.pizza_recipe_items (recipe_id, stock_item_id, size)
  where stock_item_id is not null;

-- Unicidade parcial: um preparo só pode aparecer uma vez por (recipe, size)
create unique index pizza_recipe_items_preparation_unique
  on public.pizza_recipe_items (recipe_id, preparation_id, size)
  where preparation_id is not null;

-- Garantir que exatamente um dos dois é não-nulo (XOR)
alter table public.pizza_recipe_items
  add constraint pizza_recipe_items_xor_check check (
    (stock_item_id is not null and preparation_id is null) or
    (stock_item_id is null and preparation_id is not null)
  );

create index if not exists idx_pizza_recipe_items_preparation_id on public.pizza_recipe_items (preparation_id);
