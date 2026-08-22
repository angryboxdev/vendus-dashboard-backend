-- Mapeamento produto Vendus → pizza (pizza_id + size) ou stock_item (stock_item_id).
-- Usado pelo Painel para consumo de ingredientes (pizzas via receita; outros via stock).

create table if not exists public.vendus_product_mapping (
  id uuid primary key default gen_random_uuid(),
  match_by text not null check (match_by in ('reference', 'title')),
  match_value text not null,
  target_type text not null check (target_type in ('pizza', 'stock')),
  pizza_id uuid references public.pizzas (id) on delete cascade,
  pizza_size public.pizza_size,
  stock_item_id uuid references public.stock_items (id) on delete restrict,
  created_at timestamptz default now(),
  unique (match_by, match_value),
  constraint vendus_mapping_pizza_check check (
    (target_type = 'pizza' and pizza_id is not null and pizza_size is not null and stock_item_id is null)
    or (target_type = 'stock' and stock_item_id is not null and pizza_id is null and pizza_size is null)
  )
);

comment on table public.vendus_product_mapping is 'Mapeia produtos Vendus (reference ou title) para pizza+size ou stock_item; entradas [IGNORAR...] não são inseridas';
create index idx_vendus_mapping_match on public.vendus_product_mapping (match_by, match_value);
create index idx_vendus_mapping_pizza on public.vendus_product_mapping (pizza_id) where pizza_id is not null;
create index idx_vendus_mapping_stock on public.vendus_product_mapping (stock_item_id) where stock_item_id is not null;

alter table public.vendus_product_mapping enable row level security;
create policy "Allow read for anon" on public.vendus_product_mapping for select using (true);
create policy "Allow insert for anon" on public.vendus_product_mapping for insert with check (true);
create policy "Allow update for anon" on public.vendus_product_mapping for update using (true);
create policy "Allow delete for anon" on public.vendus_product_mapping for delete using (true);
