-- Gestão de Stock: movimentações (entradas/saídas); quantidade atual = SUM(quantity) por item

create type public.stock_movement_type as enum (
  'purchase', 'consumption', 'sale', 'loss', 'adjustment', 'transfer'
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items (id) on delete restrict,
  type public.stock_movement_type not null,
  quantity numeric(14, 3) not null,
  unit_cost_per_base_unit numeric(14, 6),
  reason text,
  reference text,
  created_at timestamptz default now(),
  created_by text
);

comment on table public.stock_movements is 'Movimentações de stock; quantidade atual = SUM(quantity) por item';
comment on column public.stock_movements.quantity is 'Positivo = entrada, negativo = saída (em base_unit do item)';
comment on column public.stock_movements.unit_cost_per_base_unit is 'Custo unitário (principalmente para compras)';

create index if not exists idx_stock_movements_item_id on public.stock_movements (item_id);
create index if not exists idx_stock_movements_created_at on public.stock_movements (created_at desc);
create index if not exists idx_stock_movements_type on public.stock_movements (type);

alter table public.stock_movements enable row level security;

create policy "Allow read for anon" on public.stock_movements for select using (true);
create policy "Allow insert for anon" on public.stock_movements for insert with check (true);
create policy "Allow update for anon" on public.stock_movements for update using (true);
create policy "Allow delete for anon" on public.stock_movements for delete using (true);
