-- Local dev fixtures: stock data (categories, items, movements,
-- preparations).
--
-- org_id/location_id below are Angrybox's/Arcozelo's fixed UUIDs
-- (20260822143602_tenant_root_tables.sql). Ticket 21 dropped both column
-- defaults, so every insert here now names them explicitly -- these
-- fixtures are a write path like any other.

-- ---------------------------------------------------------------------
-- stock_categories
-- ---------------------------------------------------------------------
insert into stock_categories (org_id, name) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Massas e Farinhas'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Laticínios'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Molhos e Temperos'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Bebidas'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Embalagens e Limpeza');

-- ---------------------------------------------------------------------
-- stock_items
-- ---------------------------------------------------------------------
insert into stock_items (
  org_id, name, sku, category_id, is_sellable, sale_price, min_stock, is_active,
  base_unit, type, purchase_reference_unit_cost_with_vat, purchase_reference_unit_cost_without_vat
) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Farinha de Trigo T55', 'ING-FAR-001', (select id from stock_categories where name = 'Massas e Farinhas'),
   false, null, 25, true, 'kg', 'ingredient', 1.36, 1.20),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Fermento Padeiro', 'ING-FER-001', (select id from stock_categories where name = 'Massas e Farinhas'),
   false, null, 5, true, 'kg', 'ingredient', 4.80, 4.20),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Mozzarella Fior di Latte', 'ING-MOZ-001', (select id from stock_categories where name = 'Laticínios'),
   false, null, 15, true, 'kg', 'ingredient', 27.12, 24.00),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Parmesão Ralado', 'ING-PAR-001', (select id from stock_categories where name = 'Laticínios'),
   false, null, 5, true, 'kg', 'ingredient', 18.40, 16.60),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Molho de Tomate San Marzano', 'ING-TOM-001', (select id from stock_categories where name = 'Molhos e Temperos'),
   false, null, 10, true, 'kg', 'ingredient', 1.81, 1.60),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Azeite Virgem Extra', 'ING-AZE-001', (select id from stock_categories where name = 'Molhos e Temperos'),
   false, null, 8, true, 'l', 'ingredient', 8.10, 7.30),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Coca-Cola 33cl lata', 'BEB-COC-001', (select id from stock_categories where name = 'Bebidas'),
   true, 2.00, 48, true, 'un', 'beverage', 0.68, 0.55),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Água 50cl', 'BEB-AGU-001', (select id from stock_categories where name = 'Bebidas'),
   true, 1.50, 48, true, 'un', 'beverage', 0.34, 0.28),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Caixa Pizza 30cm', 'EMB-CXP-001', (select id from stock_categories where name = 'Embalagens e Limpeza'),
   false, null, 200, true, 'un', 'packaging', 0.30, 0.24),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Detergente Multiusos', 'LIM-DET-001', (select id from stock_categories where name = 'Embalagens e Limpeza'),
   false, null, 10, true, 'l', 'cleaning', 2.46, 2.00);

-- ---------------------------------------------------------------------
-- stock_movements
-- ---------------------------------------------------------------------
insert into stock_movements (org_id, location_id, item_id, quantity, reason, reference, movement_date, created_by, type, unit_cost_per_base_unit_with_vat, unit_cost_per_base_unit_without_vat) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'ING-FAR-001'), 50, 'Compra semanal', 'FT2026/001', current_date - 20, 'seed', 'purchase', 1.36, 1.20),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'ING-MOZ-001'), 15, 'Compra semanal', 'FT2026/005', current_date - 3, 'seed', 'purchase', 27.12, 24.00),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'ING-TOM-001'), 10, 'Compra semanal', 'FT2026/005', current_date - 3, 'seed', 'purchase', 1.81, 1.60),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'EMB-CXP-001'), 500, 'Compra trimestral', 'FT2026/002', current_date - 15, 'seed', 'purchase', 0.30, 0.24),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'ING-FAR-001'), -8, 'Consumo produção pizzas', null, current_date - 1, 'seed', 'consumption', null, null),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'ING-MOZ-001'), -4.5, 'Consumo produção pizzas', null, current_date - 1, 'seed', 'consumption', null, null),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'BEB-COC-001'), -12, 'Vendas ao balcão', null, current_date - 1, 'seed', 'sale', null, null),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'BEB-AGU-001'), -6, 'Vendas ao balcão', null, current_date - 1, 'seed', 'sale', null, null),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'ING-PAR-001'), -0.4, 'Quebra - queda acidental', null, current_date - 2, 'seed', 'loss', null, null),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'LIM-DET-001'), 10, 'Reposição de stock de limpeza', null, current_date - 10, 'seed', 'purchase', 2.46, 2.00),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'ING-AZE-001'), 8, 'Compra semanal', 'FT2026/005', current_date - 3, 'seed', 'purchase', 8.10, 7.30),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'c11d9146-fe16-4afb-9877-75e75bb2f52a', (select id from stock_items where sku = 'ING-FAR-001'), -1, 'Ajuste de inventário', null, current_date, 'seed', 'adjustment', null, null);

-- ---------------------------------------------------------------------
-- preparations
-- ---------------------------------------------------------------------
insert into preparations (org_id, name, description, yield_qty, yield_unit, use_as_unit) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Molho de Tomate Base', 'Molho de tomate temperado usado em todas as pizzas', 5, 'kg', false),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Massa de Pizza (bola 250g)', 'Bola de massa fermentada pronta a esticar', 1, 'un', true);

-- ---------------------------------------------------------------------
-- preparation_items
-- ---------------------------------------------------------------------
insert into preparation_items (org_id, preparation_id, stock_item_id, quantity) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id from preparations where name = 'Molho de Tomate Base'), (select id from stock_items where sku = 'ING-TOM-001'), 4.5),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id from preparations where name = 'Molho de Tomate Base'), (select id from stock_items where sku = 'ING-AZE-001'), 0.2),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id from preparations where name = 'Massa de Pizza (bola 250g)'), (select id from stock_items where sku = 'ING-FAR-001'), 0.16),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', (select id from preparations where name = 'Massa de Pizza (bola 250g)'), (select id from stock_items where sku = 'ING-FER-001'), 0.004);
