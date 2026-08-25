-- Local dev fixtures: invoices, payable entries, channels, classification
-- rules, and pizza menu data (natural companions -- pizzas reference stock
-- items/preparations seeded in 03_stock.sql).
--
-- Depends on suppliers/cost centers from 01_financial_base.sql and stock
-- items/preparations from 03_stock.sql.

-- ---------------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------------
insert into channels (code, name, sort_order, is_active) values
  ('BALCAO', 'Balcão', 1, true),
  ('UBER_EATS', 'Uber Eats', 2, true),
  ('GLOVO', 'Glovo', 3, true),
  ('BOLT_FOOD', 'Bolt Food', 4, true);

-- ---------------------------------------------------------------------
-- classification_rules
-- ---------------------------------------------------------------------
insert into classification_rules (
  id, supplier_id, default_cost_center_id, default_line_type, default_category,
  default_cost_center_category_id, description_pattern
) values
  (gen_random_uuid(), (select id from suppliers where name = 'Quinta do Sabor Distribuição, Lda'),
   (select id from cost_centers where code = 'CC-COZINHA'), 'stock', 'Ingredientes',
   (select id from cost_center_categories where code = 'CMV_INGREDIENTES'), '%quinta do sabor%'),
  (gen_random_uuid(), (select id from suppliers where name = 'Energia Lisboa, SA'),
   (select id from cost_centers where code = 'CC-ADMIN'), 'other', 'Utilities',
   (select id from cost_center_categories where code = 'OPEX_UTILITIES'), '%energia lisboa%');

-- ---------------------------------------------------------------------
-- invoices (id has no default -- generated explicitly)
-- ---------------------------------------------------------------------
insert into invoices (
  id, supplier_id, supplier_name, invoice_number, invoice_date, due_date, paid_at,
  subtotal_without_vat, total_vat, total_with_vat, status, cost_center_group_id,
  cost_center_category_id, financial_type, currency, supplier_nif_snapshot
) values
  (gen_random_uuid(), (select id from suppliers where name = 'Quinta do Sabor Distribuição, Lda'),
   'Quinta do Sabor Distribuição, Lda', 'FT2026/001', current_date - 20, current_date + 10, current_date - 15,
   45000, 5850, 50850, 'paid', (select id from cost_center_groups where code = 'CMV'),
   (select id from cost_center_categories where code = 'CMV_INGREDIENTES'), 'variable', 'EUR', '509123456'),
  (gen_random_uuid(), (select id from suppliers where name = 'Embalagens Norte, Lda'),
   'Embalagens Norte, Lda', 'FT2026/002', current_date - 15, current_date + 15, null,
   12000, 2760, 14760, 'pending', (select id from cost_center_groups where code = 'CMV'),
   (select id from cost_center_categories where code = 'CMV_EMBALAGENS'), 'variable', 'EUR', '509234567'),
  (gen_random_uuid(), (select id from suppliers where name = 'Energia Lisboa, SA'),
   'Energia Lisboa, SA', 'FT2026/003', current_date - 10, current_date - 1, null,
   18000, 4140, 22140, 'pending', (select id from cost_center_groups where code = 'OPEX'),
   (select id from cost_center_categories where code = 'OPEX_UTILITIES'), 'variable', 'EUR', '509345678'),
  (gen_random_uuid(), (select id from suppliers where name = 'Publicidade Criativa, Lda'),
   'Publicidade Criativa, Lda', 'FT2026/004', current_date - 5, current_date + 25, null,
   30000, 6900, 36900, 'pending', (select id from cost_center_groups where code = 'MARKETING'),
   (select id from cost_center_categories where code = 'MKT_ADS'), 'variable', 'EUR', '509456789'),
  (gen_random_uuid(), (select id from suppliers where name = 'Quinta do Sabor Distribuição, Lda'),
   'Quinta do Sabor Distribuição, Lda', 'FT2026/005', current_date - 3, current_date + 27, null,
   52000, 6760, 58760, 'pending', (select id from cost_center_groups where code = 'CMV'),
   (select id from cost_center_categories where code = 'CMV_INGREDIENTES'), 'variable', 'EUR', '509123456'),
  (gen_random_uuid(), (select id from suppliers where name = 'Embalagens Norte, Lda'),
   'Embalagens Norte, Lda', 'FT2026/006', current_date - 1, current_date + 29, null,
   8000, 1840, 9840, 'pending', (select id from cost_center_groups where code = 'CMV'),
   (select id from cost_center_categories where code = 'CMV_EMBALAGENS'), 'variable', 'EUR', '509234567');

-- ---------------------------------------------------------------------
-- invoice_lines (id has no default -- generated explicitly)
-- ---------------------------------------------------------------------
insert into invoice_lines (
  id, invoice_id, description, type, cost_center_id, category, stock_item_id,
  quantity, unit, unit_cost_without_vat, vat_rate, vat_amount, total_with_vat,
  cost_center_category_id, financial_type
) values
  (gen_random_uuid(), (select id from invoices where invoice_number = 'FT2026/001'),
   'Farinha de Trigo T55 - 25kg', 'stock', (select id from cost_centers where code = 'CC-COZINHA'),
   'Ingredientes', (select id from stock_items where sku = 'ING-FAR-001'), 25, 'kg', 1200, 13, 3900, 33900,
   (select id from cost_center_categories where code = 'CMV_INGREDIENTES'), 'variable'),
  (gen_random_uuid(), (select id from invoices where invoice_number = 'FT2026/001'),
   'Fermento Padeiro - 4kg', 'stock', (select id from cost_centers where code = 'CC-COZINHA'),
   'Ingredientes', (select id from stock_items where sku = 'ING-FER-001'), 4, 'kg', 3750, 13, 1950, 16950,
   (select id from cost_center_categories where code = 'CMV_INGREDIENTES'), 'variable'),
  (gen_random_uuid(), (select id from invoices where invoice_number = 'FT2026/002'),
   'Caixa Pizza 30cm - 500un', 'stock', (select id from cost_centers where code = 'CC-COZINHA'),
   'Embalagens', (select id from stock_items where sku = 'EMB-CXP-001'), 500, 'un', 24, 23, 2760, 14760,
   (select id from cost_center_categories where code = 'CMV_EMBALAGENS'), 'variable'),
  (gen_random_uuid(), (select id from invoices where invoice_number = 'FT2026/003'),
   'Consumo de eletricidade - Agosto', 'other', (select id from cost_centers where code = 'CC-ADMIN'),
   'Utilities', null, 1, null, 18000, 23, 4140, 22140,
   (select id from cost_center_categories where code = 'OPEX_UTILITIES'), 'variable'),
  (gen_random_uuid(), (select id from invoices where invoice_number = 'FT2026/004'),
   'Campanha Instagram Ads - Agosto', 'other', (select id from cost_centers where code = 'CC-MKT'),
   'Publicidade', null, 1, null, 30000, 23, 6900, 36900,
   (select id from cost_center_categories where code = 'MKT_ADS'), 'variable'),
  (gen_random_uuid(), (select id from invoices where invoice_number = 'FT2026/005'),
   'Mozzarella Fior di Latte - 15kg', 'stock', (select id from cost_centers where code = 'CC-COZINHA'),
   'Ingredientes', (select id from stock_items where sku = 'ING-MOZ-001'), 15, 'kg', 2400, 13, 4680, 40680,
   (select id from cost_center_categories where code = 'CMV_INGREDIENTES'), 'variable'),
  (gen_random_uuid(), (select id from invoices where invoice_number = 'FT2026/005'),
   'Molho de Tomate San Marzano - 10kg', 'stock', (select id from cost_centers where code = 'CC-COZINHA'),
   'Ingredientes', (select id from stock_items where sku = 'ING-TOM-001'), 10, 'kg', 1600, 13, 2080, 18080,
   (select id from cost_center_categories where code = 'CMV_INGREDIENTES'), 'variable'),
  (gen_random_uuid(), (select id from invoices where invoice_number = 'FT2026/006'),
   'Detergente Multiusos - 40un', 'stock', (select id from cost_centers where code = 'CC-COZINHA'),
   'Embalagens', (select id from stock_items where sku = 'LIM-DET-001'), 40, 'un', 200, 23, 1840, 9840,
   (select id from cost_center_categories where code = 'CMV_EMBALAGENS'), 'variable');

-- ---------------------------------------------------------------------
-- payable_entries (cost_center_id here FKs to cost_center_groups, per schema)
-- ---------------------------------------------------------------------
insert into payable_entries (
  invoice_id, supplier_id, supplier_name, description, cost_center_id, category,
  amount, due_date, paid_at, status, payment_method
) values
  ((select id from invoices where invoice_number = 'FT2026/001'),
   (select id from suppliers where name = 'Quinta do Sabor Distribuição, Lda'), 'Quinta do Sabor Distribuição, Lda',
   'Ingredientes - Fatura FT2026/001', (select id from cost_center_groups where code = 'CMV'), 'Ingredientes',
   50850, current_date + 10, current_date - 15, 'paid', 'transfer'),
  ((select id from invoices where invoice_number = 'FT2026/002'),
   (select id from suppliers where name = 'Embalagens Norte, Lda'), 'Embalagens Norte, Lda',
   'Embalagens - Agosto', (select id from cost_center_groups where code = 'CMV'), 'Embalagens',
   14760, current_date + 15, null, 'pending', 'transfer'),
  ((select id from invoices where invoice_number = 'FT2026/003'),
   (select id from suppliers where name = 'Energia Lisboa, SA'), 'Energia Lisboa, SA',
   'Eletricidade - Agosto', (select id from cost_center_groups where code = 'OPEX'), 'Utilities',
   22140, current_date - 1, null, 'pending', 'direct_debit'),
  ((select id from invoices where invoice_number = 'FT2026/004'),
   (select id from suppliers where name = 'Publicidade Criativa, Lda'), 'Publicidade Criativa, Lda',
   'Campanha Ads - Agosto', (select id from cost_center_groups where code = 'MARKETING'), 'Publicidade',
   36900, current_date + 25, null, 'pending', 'card'),
  (null, null, 'Renda do Espaço - Proprietário', 'Renda mensal - Agosto',
   (select id from cost_center_groups where code = 'OPEX'), 'Renda',
   120000, current_date + 5, null, 'pending', 'direct_debit'),
  ((select id from invoices where invoice_number = 'FT2026/005'),
   (select id from suppliers where name = 'Quinta do Sabor Distribuição, Lda'), 'Quinta do Sabor Distribuição, Lda',
   'Ingredientes - Fatura FT2026/005', (select id from cost_center_groups where code = 'CMV'), 'Ingredientes',
   58760, current_date + 27, null, 'pending', 'transfer');

-- ---------------------------------------------------------------------
-- pizzas / pizza_recipes / pizza_recipe_items / pizza_prices
-- ---------------------------------------------------------------------
insert into pizzas (name, description, is_active, category) values
  ('Margherita', 'Molho de tomate, mozzarella, manjericão', true, 'classics'),
  ('Angrybox Especial', 'Pepperoni picante, cogumelos, cebola caramelizada', true, 'specials'),
  ('Nutella e Morango', 'Nutella, morangos frescos, açúcar em pó', true, 'sweeties');

insert into pizza_prices (pizza_id, price, size) values
  ((select id from pizzas where name = 'Margherita'), 8.50, 'small'),
  ((select id from pizzas where name = 'Margherita'), 11.50, 'large'),
  ((select id from pizzas where name = 'Angrybox Especial'), 10.50, 'small'),
  ((select id from pizzas where name = 'Angrybox Especial'), 13.90, 'large'),
  ((select id from pizzas where name = 'Nutella e Morango'), 7.90, 'small'),
  ((select id from pizzas where name = 'Nutella e Morango'), 10.90, 'large');

insert into pizza_recipes (pizza_id, version, is_active) values
  ((select id from pizzas where name = 'Margherita'), 1, true),
  ((select id from pizzas where name = 'Angrybox Especial'), 1, true),
  ((select id from pizzas where name = 'Nutella e Morango'), 1, true);

insert into pizza_recipe_items (recipe_id, stock_item_id, preparation_id, quantity, waste_factor, is_optional, size) values
  ((select id from pizza_recipes where pizza_id = (select id from pizzas where name = 'Margherita')),
   null, (select id from preparations where name = 'Molho de Tomate Base'), 0.15, 0.05, false, 'small'),
  ((select id from pizza_recipes where pizza_id = (select id from pizzas where name = 'Margherita')),
   (select id from stock_items where sku = 'ING-MOZ-001'), null, 0.12, 0.03, false, 'small'),
  ((select id from pizza_recipes where pizza_id = (select id from pizzas where name = 'Margherita')),
   null, (select id from preparations where name = 'Molho de Tomate Base'), 0.22, 0.05, false, 'large'),
  ((select id from pizza_recipes where pizza_id = (select id from pizzas where name = 'Margherita')),
   (select id from stock_items where sku = 'ING-MOZ-001'), null, 0.18, 0.03, false, 'large'),
  ((select id from pizza_recipes where pizza_id = (select id from pizzas where name = 'Angrybox Especial')),
   (select id from stock_items where sku = 'ING-MOZ-001'), null, 0.10, 0.03, false, 'small'),
  ((select id from pizza_recipes where pizza_id = (select id from pizzas where name = 'Angrybox Especial')),
   (select id from stock_items where sku = 'ING-MOZ-001'), null, 0.15, 0.03, false, 'large');
