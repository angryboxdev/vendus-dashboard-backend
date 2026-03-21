-- Custos de compra: com IVA e sem IVA (catálogo + movimentações).
-- Se existia purchase_reference_unit_cost (015), copia para sem IVA e remove.
-- Se existia unit_cost_per_base_unit em movimentos, copia para sem IVA e remove.

-- ---------- stock_items ----------
alter table public.stock_items
  add column if not exists purchase_reference_unit_cost_with_vat numeric(14, 6);

alter table public.stock_items
  add column if not exists purchase_reference_unit_cost_without_vat numeric(14, 6);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_items'
      and column_name = 'purchase_reference_unit_cost'
  ) then
    update public.stock_items
    set purchase_reference_unit_cost_without_vat = purchase_reference_unit_cost
    where purchase_reference_unit_cost is not null;
    alter table public.stock_items drop column purchase_reference_unit_cost;
  end if;
end $$;

comment on column public.stock_items.purchase_reference_unit_cost_with_vat is
  'Custo de referência por base_unit com IVA (opcional).';

comment on column public.stock_items.purchase_reference_unit_cost_without_vat is
  'Custo de referência por base_unit sem IVA (opcional).';

-- ---------- stock_movements ----------
alter table public.stock_movements
  add column if not exists unit_cost_per_base_unit_with_vat numeric(14, 6);

alter table public.stock_movements
  add column if not exists unit_cost_per_base_unit_without_vat numeric(14, 6);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_movements'
      and column_name = 'unit_cost_per_base_unit'
  ) then
    update public.stock_movements
    set unit_cost_per_base_unit_without_vat = unit_cost_per_base_unit
    where unit_cost_per_base_unit is not null;
    alter table public.stock_movements drop column unit_cost_per_base_unit;
  end if;
end $$;

comment on column public.stock_movements.unit_cost_per_base_unit_with_vat is
  'Custo unitário com IVA (compras).';

comment on column public.stock_movements.unit_cost_per_base_unit_without_vat is
  'Custo unitário sem IVA (compras).';
