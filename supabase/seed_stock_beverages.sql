-- Só estas duas bebidas alcoólicas (San Miguel). Categoria: Bebidas alcoólicas.
-- Idempotente por nome. Só INSERT; não apaga dados.
-- Requer migração 016 (custos com/sem IVA).

insert into public.stock_categories (name)
select 'Bebidas alcoólicas'
where not exists (select 1 from public.stock_categories c where c.name = 'Bebidas alcoólicas');

insert into public.stock_items (
  name,
  category_id,
  type,
  is_sellable,
  sale_price,
  purchase_reference_unit_cost_without_vat,
  purchase_reference_unit_cost_with_vat,
  min_stock,
  base_unit,
  is_active
)
select v.name, cat.id, 'beverage'::public.stock_item_type, v.is_sellable, v.sale_price,
       v.cost_without, v.cost_with, 0, 'un'::public.stock_base_unit, true
from public.stock_categories cat
cross join (values
  ('San Miguel Mini 25cl', true, 2.50::numeric, 0.60::numeric, 0.73::numeric),
  ('San Miguel Fresca 33cl', true, 3.00::numeric, 1.00::numeric, 1.23::numeric)
) as v(name, is_sellable, sale_price, cost_without, cost_with)
where cat.name = 'Bebidas alcoólicas'
  and not exists (select 1 from public.stock_items s where s.name = v.name);
