-- Opcional: se as San Miguel já existem com category_id de "Bebidas", move para "Bebidas alcoólicas".
-- Correr uma vez no SQL Editor.

insert into public.stock_categories (name)
select 'Bebidas alcoólicas'
where not exists (select 1 from public.stock_categories c where c.name = 'Bebidas alcoólicas');

update public.stock_items s
set category_id = c.id, updated_at = now()
from public.stock_categories c
where c.name = 'Bebidas alcoólicas'
  and s.name in ('San Miguel Mini 25cl', 'San Miguel Fresca 33cl');
