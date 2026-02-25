-- Gestão de Stock: tipos e tabela de itens

create type public.stock_item_type as enum (
  'ingredient', 'beverage', 'packaging', 'cleaning', 'other'
);

create type public.stock_base_unit as enum (
  'g', 'kg', 'ml', 'l', 'un'
);

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  category_id uuid not null references public.stock_categories (id) on delete restrict,
  type public.stock_item_type not null,
  is_sellable boolean not null default false,
  sale_price numeric(10, 2),
  min_stock numeric(14, 3) not null default 0,
  base_unit public.stock_base_unit not null,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint stock_items_sale_price_when_sellable check (
    (is_sellable = false and sale_price is null) or (is_sellable = true)
  )
);

comment on table public.stock_items is 'Itens de stock (ingredientes, bebidas, embalagens, etc.)';
comment on column public.stock_items.sku is 'Código do produto (opcional)';
comment on column public.stock_items.min_stock is 'Stock mínimo em base_unit';
comment on column public.stock_items.sale_price is 'Preço de venda (apenas se is_sellable = true)';

create index if not exists idx_stock_items_category_id on public.stock_items (category_id);
create index if not exists idx_stock_items_type on public.stock_items (type);
create index if not exists idx_stock_items_is_active on public.stock_items (is_active);
create unique index if not exists idx_stock_items_sku on public.stock_items (sku) where sku is not null and sku != '';

alter table public.stock_items enable row level security;

create policy "Allow read for anon" on public.stock_items for select using (true);
create policy "Allow insert for anon" on public.stock_items for insert with check (true);
create policy "Allow update for anon" on public.stock_items for update using (true);
create policy "Allow delete for anon" on public.stock_items for delete using (true);
