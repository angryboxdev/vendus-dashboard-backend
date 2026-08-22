-- Data da movimentação editável pelo utilizador (quando ocorreu); por defeito = created_at
alter table public.stock_movements
  add column if not exists movement_date timestamptz not null default now();

comment on column public.stock_movements.movement_date is 'Data em que a movimentação ocorreu (editável); usado em relatórios de período';

-- Preencher linhas existentes: data da movimentação = created_at
update public.stock_movements
set movement_date = created_at;

create index if not exists idx_stock_movements_movement_date on public.stock_movements (movement_date desc);
