-- Gestão de Stock: categorias de produtos (ingredientes, bebidas, etc.)

create table if not exists public.stock_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.stock_categories is 'Categorias de produtos para stock (ex: Ingredientes, Bebidas)';

create index if not exists idx_stock_categories_name on public.stock_categories (name);

alter table public.stock_categories enable row level security;

create policy "Allow read for anon" on public.stock_categories for select using (true);
create policy "Allow insert for anon" on public.stock_categories for insert with check (true);
create policy "Allow update for anon" on public.stock_categories for update using (true);
create policy "Allow delete for anon" on public.stock_categories for delete using (true);
