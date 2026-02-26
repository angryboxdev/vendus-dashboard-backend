-- Seed: pizzas, preços (small/large) e receitas (ingredientes por tamanho).
-- Executar após migrations 009–012 e após seed de stock_items (nomes dos ingredientes devem existir).
-- Categorias: Salgadas → classics, Especiais → specials, Doces → sweeties.
--
-- Stock items necessários (exact name em stock_items): Azeite, Azeite Trufado, Abacaxi, Atum,
-- Brigadeiro de Oreo, Camarão, Cebola Crispy, Cebola Roxa, Cogumelos, Creme de Alho, Doce de Leite,
-- Farinha Caputo Saccorosso, Fermento Fermipan, Frango, Maionese de Alho, Malte Enzimática,
-- Mel Makro, Molho de tomate Angry Box, Molho de Trufa, Oreo, Pepperoni Porminho, Queijo Camembert Metro,
-- Queijo Cheddar Villas, Queijo Gorgonzola Casa Leonardi, Queijo Grana Padano Zanetti,
-- Queijo Mozzarela Eurial, Sal Vatel, Salsa Makro, Azeitona Preta.

-- 1) Pizzas
insert into public.pizzas (name, description, category, is_active)
values
  ('Creamy Garlic', '', 'classics', true),
  ('Tomate & Pesto', '', 'classics', true),
  ('Truffle Shrooms', '', 'classics', true),
  ('Tuna & Mayo', '', 'classics', true),
  ('4 Formaggios+', '', 'specials', true),
  ('Chicken & Cheese', '', 'specials', true),
  ('Honey Peperoni', '', 'specials', true),
  ('Sweet Smoked Shrimp', '', 'specials', true),
  ('Brigadeiro', '', 'sweeties', true),
  ('Cookies and Cream', '', 'sweeties', true),
  ('Doce de Leite e Banana', '', 'sweeties', true);

-- 2) Preços (small / large)
insert into public.pizza_prices (pizza_id, size, price)
select p.id, 'small'::public.pizza_size, 9.90 from public.pizzas p where p.name = 'Creamy Garlic'
union all select p.id, 'large'::public.pizza_size, 18.50 from public.pizzas p where p.name = 'Creamy Garlic'
union all select p.id, 'small'::public.pizza_size, 8.90 from public.pizzas p where p.name = 'Tomate & Pesto'
union all select p.id, 'large'::public.pizza_size, 16.90 from public.pizzas p where p.name = 'Tomate & Pesto'
union all select p.id, 'small'::public.pizza_size, 8.90 from public.pizzas p where p.name = 'Truffle Shrooms'
union all select p.id, 'large'::public.pizza_size, 16.90 from public.pizzas p where p.name = 'Truffle Shrooms'
union all select p.id, 'small'::public.pizza_size, 8.90 from public.pizzas p where p.name = 'Tuna & Mayo'
union all select p.id, 'large'::public.pizza_size, 16.90 from public.pizzas p where p.name = 'Tuna & Mayo'
union all select p.id, 'small'::public.pizza_size, 10.90 from public.pizzas p where p.name = '4 Formaggios+'
union all select p.id, 'large'::public.pizza_size, 19.90 from public.pizzas p where p.name = '4 Formaggios+'
union all select p.id, 'small'::public.pizza_size, 10.90 from public.pizzas p where p.name = 'Chicken & Cheese'
union all select p.id, 'large'::public.pizza_size, 19.90 from public.pizzas p where p.name = 'Chicken & Cheese'
union all select p.id, 'small'::public.pizza_size, 10.90 from public.pizzas p where p.name = 'Honey Peperoni'
union all select p.id, 'large'::public.pizza_size, 19.90 from public.pizzas p where p.name = 'Honey Peperoni'
union all select p.id, 'small'::public.pizza_size, 10.90 from public.pizzas p where p.name = 'Sweet Smoked Shrimp'
union all select p.id, 'large'::public.pizza_size, 19.90 from public.pizzas p where p.name = 'Sweet Smoked Shrimp'
union all select p.id, 'small'::public.pizza_size, 7.90 from public.pizzas p where p.name = 'Brigadeiro'
union all select p.id, 'large'::public.pizza_size, 13.90 from public.pizzas p where p.name = 'Brigadeiro'
union all select p.id, 'small'::public.pizza_size, 7.90 from public.pizzas p where p.name = 'Cookies and Cream'
union all select p.id, 'large'::public.pizza_size, 13.90 from public.pizzas p where p.name = 'Cookies and Cream'
union all select p.id, 'small'::public.pizza_size, 7.90 from public.pizzas p where p.name = 'Doce de Leite e Banana'
union all select p.id, 'large'::public.pizza_size, 13.90 from public.pizzas p where p.name = 'Doce de Leite e Banana';

-- 3) Uma receita ativa (version 1) por pizza
insert into public.pizza_recipes (pizza_id, version, is_active, notes)
select id, 1, true, null from public.pizzas;

-- 4) Itens das receitas (recipe_id + stock_item por nome + size + quantity)
with recipe_by_pizza as (
  select p.name as pizza_name, r.id as recipe_id
  from public.pizzas p
  join public.pizza_recipes r on r.pizza_id = p.id
  where r.version = 1
),
rows as (
  select pizza_name, stock_name, size, qty from (values
    ('Creamy Garlic', 'Queijo Mozzarela Eurial', 'small', 112.50),
    ('Creamy Garlic', 'Queijo Mozzarela Eurial', 'large', 225),
    ('Creamy Garlic', 'Molho de tomate Angry Box', 'small', 10),
    ('Creamy Garlic', 'Molho de tomate Angry Box', 'large', 20),
    ('Creamy Garlic', 'Farinha Caputo Saccorosso', 'small', 100),
    ('Creamy Garlic', 'Farinha Caputo Saccorosso', 'large', 200),
    ('Creamy Garlic', 'Sal Vatel', 'small', 2),
    ('Creamy Garlic', 'Sal Vatel', 'large', 4),
    ('Creamy Garlic', 'Fermento Fermipan', 'small', 0.50),
    ('Creamy Garlic', 'Fermento Fermipan', 'large', 1),
    ('Creamy Garlic', 'Mel Makro', 'small', 30),
    ('Creamy Garlic', 'Mel Makro', 'large', 60),
    ('Creamy Garlic', 'Malte Enzimática', 'small', 1),
    ('Creamy Garlic', 'Malte Enzimática', 'large', 2),
    ('Creamy Garlic', 'Queijo Cheddar Villas', 'small', 12.50),
    ('Creamy Garlic', 'Queijo Cheddar Villas', 'large', 25),
    ('Creamy Garlic', 'Creme de Alho', 'small', 50),
    ('Creamy Garlic', 'Creme de Alho', 'large', 100),
    ('Creamy Garlic', 'Salsa Makro', 'small', 1),
    ('Creamy Garlic', 'Salsa Makro', 'large', 2),
    ('Tomate & Pesto', 'Queijo Mozzarela Eurial', 'small', 112.50),
    ('Tomate & Pesto', 'Queijo Mozzarela Eurial', 'large', 225),
    ('Tomate & Pesto', 'Molho de tomate Angry Box', 'small', 80),
    ('Tomate & Pesto', 'Molho de tomate Angry Box', 'large', 160),
    ('Tomate & Pesto', 'Farinha Caputo Saccorosso', 'small', 100),
    ('Tomate & Pesto', 'Farinha Caputo Saccorosso', 'large', 200),
    ('Tomate & Pesto', 'Sal Vatel', 'small', 2),
    ('Tomate & Pesto', 'Sal Vatel', 'large', 4),
    ('Tomate & Pesto', 'Fermento Fermipan', 'small', 0.50),
    ('Tomate & Pesto', 'Fermento Fermipan', 'large', 1),
    ('Tomate & Pesto', 'Malte Enzimática', 'small', 1),
    ('Tomate & Pesto', 'Malte Enzimática', 'large', 2),
    ('Tomate & Pesto', 'Queijo Cheddar Villas', 'small', 12.50),
    ('Tomate & Pesto', 'Queijo Cheddar Villas', 'large', 25),
    ('Tomate & Pesto', 'Salsa Makro', 'small', 1),
    ('Tomate & Pesto', 'Salsa Makro', 'large', 2),
    ('Truffle Shrooms', 'Azeite', 'small', 5),
    ('Truffle Shrooms', 'Azeite', 'large', 10),
    ('Truffle Shrooms', 'Queijo Mozzarela Eurial', 'small', 112.50),
    ('Truffle Shrooms', 'Queijo Mozzarela Eurial', 'large', 225),
    ('Truffle Shrooms', 'Molho de tomate Angry Box', 'small', 10),
    ('Truffle Shrooms', 'Molho de tomate Angry Box', 'large', 20),
    ('Truffle Shrooms', 'Cogumelos', 'small', 75),
    ('Truffle Shrooms', 'Cogumelos', 'large', 150),
    ('Truffle Shrooms', 'Farinha Caputo Saccorosso', 'small', 100),
    ('Truffle Shrooms', 'Farinha Caputo Saccorosso', 'large', 200),
    ('Truffle Shrooms', 'Sal Vatel', 'small', 2),
    ('Truffle Shrooms', 'Sal Vatel', 'large', 4),
    ('Truffle Shrooms', 'Fermento Fermipan', 'small', 0.50),
    ('Truffle Shrooms', 'Fermento Fermipan', 'large', 1),
    ('Truffle Shrooms', 'Molho de Trufa', 'small', 25),
    ('Truffle Shrooms', 'Molho de Trufa', 'large', 50),
    ('Truffle Shrooms', 'Azeite Trufado', 'small', 7),
    ('Truffle Shrooms', 'Azeite Trufado', 'large', 14),
    ('Truffle Shrooms', 'Malte Enzimática', 'small', 1),
    ('Truffle Shrooms', 'Malte Enzimática', 'large', 2),
    ('Truffle Shrooms', 'Queijo Cheddar Villas', 'small', 12.50),
    ('Truffle Shrooms', 'Queijo Cheddar Villas', 'large', 25),
    ('Truffle Shrooms', 'Salsa Makro', 'small', 1),
    ('Truffle Shrooms', 'Salsa Makro', 'large', 2),
    ('Tuna & Mayo', 'Queijo Mozzarela Eurial', 'small', 112.50),
    ('Tuna & Mayo', 'Queijo Mozzarela Eurial', 'large', 225),
    ('Tuna & Mayo', 'Molho de tomate Angry Box', 'small', 10),
    ('Tuna & Mayo', 'Molho de tomate Angry Box', 'large', 20),
    ('Tuna & Mayo', 'Farinha Caputo Saccorosso', 'small', 100),
    ('Tuna & Mayo', 'Farinha Caputo Saccorosso', 'large', 200),
    ('Tuna & Mayo', 'Sal Vatel', 'small', 2),
    ('Tuna & Mayo', 'Sal Vatel', 'large', 4),
    ('Tuna & Mayo', 'Fermento Fermipan', 'small', 0.50),
    ('Tuna & Mayo', 'Fermento Fermipan', 'large', 1),
    ('Tuna & Mayo', 'Cebola Roxa', 'small', 20),
    ('Tuna & Mayo', 'Cebola Roxa', 'large', 40),
    ('Tuna & Mayo', 'Azeitona Preta', 'small', 30),
    ('Tuna & Mayo', 'Azeitona Preta', 'large', 60),
    ('Tuna & Mayo', 'Maionese de Alho', 'small', 25),
    ('Tuna & Mayo', 'Maionese de Alho', 'large', 50),
    ('Tuna & Mayo', 'Atum', 'small', 65),
    ('Tuna & Mayo', 'Atum', 'large', 130),
    ('Tuna & Mayo', 'Cebola Crispy', 'small', 25),
    ('Tuna & Mayo', 'Cebola Crispy', 'large', 50),
    ('Tuna & Mayo', 'Malte Enzimática', 'small', 1),
    ('Tuna & Mayo', 'Malte Enzimática', 'large', 2),
    ('Tuna & Mayo', 'Queijo Cheddar Villas', 'small', 12.50),
    ('Tuna & Mayo', 'Queijo Cheddar Villas', 'large', 25),
    ('4 Formaggios+', 'Queijo Mozzarela Eurial', 'small', 112.50),
    ('4 Formaggios+', 'Queijo Mozzarela Eurial', 'large', 225),
    ('4 Formaggios+', 'Molho de tomate Angry Box', 'small', 10),
    ('4 Formaggios+', 'Molho de tomate Angry Box', 'large', 20),
    ('4 Formaggios+', 'Queijo Grana Padano Zanetti', 'small', 7),
    ('4 Formaggios+', 'Queijo Grana Padano Zanetti', 'large', 14),
    ('4 Formaggios+', 'Queijo Gorgonzola Casa Leonardi', 'small', 30),
    ('4 Formaggios+', 'Queijo Gorgonzola Casa Leonardi', 'large', 60),
    ('4 Formaggios+', 'Farinha Caputo Saccorosso', 'small', 100),
    ('4 Formaggios+', 'Farinha Caputo Saccorosso', 'large', 200),
    ('4 Formaggios+', 'Sal Vatel', 'small', 2),
    ('4 Formaggios+', 'Sal Vatel', 'large', 4),
    ('4 Formaggios+', 'Fermento Fermipan', 'small', 0.50),
    ('4 Formaggios+', 'Fermento Fermipan', 'large', 1),
    ('4 Formaggios+', 'Azeite Trufado', 'small', 5),
    ('4 Formaggios+', 'Azeite Trufado', 'large', 10),
    ('4 Formaggios+', 'Malte Enzimática', 'small', 1),
    ('4 Formaggios+', 'Malte Enzimática', 'large', 2),
    ('4 Formaggios+', 'Queijo Cheddar Villas', 'small', 12.50),
    ('4 Formaggios+', 'Queijo Cheddar Villas', 'large', 25),
    ('4 Formaggios+', 'Queijo Camembert Metro', 'small', 25),
    ('4 Formaggios+', 'Queijo Camembert Metro', 'large', 50),
    ('4 Formaggios+', 'Salsa Makro', 'small', 1),
    ('4 Formaggios+', 'Salsa Makro', 'large', 2),
    ('Chicken & Cheese', 'Queijo Mozzarela Eurial', 'small', 112.50),
    ('Chicken & Cheese', 'Queijo Mozzarela Eurial', 'large', 225),
    ('Chicken & Cheese', 'Molho de tomate Angry Box', 'small', 10),
    ('Chicken & Cheese', 'Molho de tomate Angry Box', 'large', 20),
    ('Chicken & Cheese', 'Queijo Grana Padano Zanetti', 'small', 7),
    ('Chicken & Cheese', 'Queijo Grana Padano Zanetti', 'large', 14),
    ('Chicken & Cheese', 'Farinha Caputo Saccorosso', 'small', 100),
    ('Chicken & Cheese', 'Farinha Caputo Saccorosso', 'large', 200),
    ('Chicken & Cheese', 'Sal Vatel', 'small', 2),
    ('Chicken & Cheese', 'Sal Vatel', 'large', 4),
    ('Chicken & Cheese', 'Fermento Fermipan', 'small', 0.50),
    ('Chicken & Cheese', 'Fermento Fermipan', 'large', 1),
    ('Chicken & Cheese', 'Azeite Trufado', 'small', 5),
    ('Chicken & Cheese', 'Azeite Trufado', 'large', 10),
    ('Chicken & Cheese', 'Frango', 'small', 100),
    ('Chicken & Cheese', 'Frango', 'large', 200),
    ('Chicken & Cheese', 'Malte Enzimática', 'small', 1),
    ('Chicken & Cheese', 'Malte Enzimática', 'large', 2),
    ('Chicken & Cheese', 'Queijo Cheddar Villas', 'small', 12.50),
    ('Chicken & Cheese', 'Queijo Cheddar Villas', 'large', 25),
    ('Chicken & Cheese', 'Queijo Camembert Metro', 'small', 25),
    ('Chicken & Cheese', 'Queijo Camembert Metro', 'large', 50),
    ('Chicken & Cheese', 'Salsa Makro', 'small', 1),
    ('Chicken & Cheese', 'Salsa Makro', 'large', 2),
    ('Honey Peperoni', 'Azeite', 'small', 0.01),
    ('Honey Peperoni', 'Azeite', 'large', 0.02),
    ('Honey Peperoni', 'Queijo Mozzarela Eurial', 'small', 112.50),
    ('Honey Peperoni', 'Queijo Mozzarela Eurial', 'large', 225),
    ('Honey Peperoni', 'Molho de tomate Angry Box', 'small', 80),
    ('Honey Peperoni', 'Molho de tomate Angry Box', 'large', 160),
    ('Honey Peperoni', 'Pepperoni Porminho', 'small', 60),
    ('Honey Peperoni', 'Pepperoni Porminho', 'large', 120),
    ('Honey Peperoni', 'Farinha Caputo Saccorosso', 'small', 100),
    ('Honey Peperoni', 'Farinha Caputo Saccorosso', 'large', 200),
    ('Honey Peperoni', 'Sal Vatel', 'small', 2),
    ('Honey Peperoni', 'Sal Vatel', 'large', 4),
    ('Honey Peperoni', 'Fermento Fermipan', 'small', 0.50),
    ('Honey Peperoni', 'Fermento Fermipan', 'large', 1),
    ('Honey Peperoni', 'Mel Makro', 'small', 30),
    ('Honey Peperoni', 'Mel Makro', 'large', 60),
    ('Honey Peperoni', 'Malte Enzimática', 'small', 1),
    ('Honey Peperoni', 'Malte Enzimática', 'large', 2),
    ('Honey Peperoni', 'Queijo Cheddar Villas', 'small', 12.50),
    ('Honey Peperoni', 'Queijo Cheddar Villas', 'large', 25),
    ('Honey Peperoni', 'Salsa Makro', 'small', 1),
    ('Honey Peperoni', 'Salsa Makro', 'large', 2),
    ('Sweet Smoked Shrimp', 'Queijo Mozzarela Eurial', 'small', 112.50),
    ('Sweet Smoked Shrimp', 'Queijo Mozzarela Eurial', 'large', 225),
    ('Sweet Smoked Shrimp', 'Molho de tomate Angry Box', 'small', 10),
    ('Sweet Smoked Shrimp', 'Molho de tomate Angry Box', 'large', 20),
    ('Sweet Smoked Shrimp', 'Farinha Caputo Saccorosso', 'small', 100),
    ('Sweet Smoked Shrimp', 'Farinha Caputo Saccorosso', 'large', 200),
    ('Sweet Smoked Shrimp', 'Sal Vatel', 'small', 2),
    ('Sweet Smoked Shrimp', 'Sal Vatel', 'large', 4),
    ('Sweet Smoked Shrimp', 'Fermento Fermipan', 'small', 0.50),
    ('Sweet Smoked Shrimp', 'Fermento Fermipan', 'large', 1),
    ('Sweet Smoked Shrimp', 'Mel Makro', 'small', 30),
    ('Sweet Smoked Shrimp', 'Mel Makro', 'large', 60),
    ('Sweet Smoked Shrimp', 'Camarão', 'small', 60),
    ('Sweet Smoked Shrimp', 'Camarão', 'large', 120),
    ('Sweet Smoked Shrimp', 'Abacaxi', 'small', 30),
    ('Sweet Smoked Shrimp', 'Abacaxi', 'large', 60),
    ('Sweet Smoked Shrimp', 'Malte Enzimática', 'small', 1),
    ('Sweet Smoked Shrimp', 'Malte Enzimática', 'large', 2),
    ('Sweet Smoked Shrimp', 'Queijo Cheddar Villas', 'small', 12.50),
    ('Sweet Smoked Shrimp', 'Queijo Cheddar Villas', 'large', 25),
    ('Sweet Smoked Shrimp', 'Salsa Makro', 'small', 1),
    ('Sweet Smoked Shrimp', 'Salsa Makro', 'large', 2),
    ('Brigadeiro', 'Farinha Caputo Saccorosso', 'small', 100),
    ('Brigadeiro', 'Farinha Caputo Saccorosso', 'large', 200),
    ('Brigadeiro', 'Sal Vatel', 'small', 1),
    ('Brigadeiro', 'Sal Vatel', 'large', 2),
    ('Brigadeiro', 'Fermento Fermipan', 'small', 0.50),
    ('Brigadeiro', 'Fermento Fermipan', 'large', 1),
    ('Brigadeiro', 'Malte Enzimática', 'small', 1),
    ('Brigadeiro', 'Malte Enzimática', 'large', 2),
    ('Cookies and Cream', 'Farinha Caputo Saccorosso', 'small', 100),
    ('Cookies and Cream', 'Farinha Caputo Saccorosso', 'large', 200),
    ('Cookies and Cream', 'Sal Vatel', 'small', 2),
    ('Cookies and Cream', 'Sal Vatel', 'large', 4),
    ('Cookies and Cream', 'Fermento Fermipan', 'small', 0.50),
    ('Cookies and Cream', 'Fermento Fermipan', 'large', 1),
    ('Cookies and Cream', 'Brigadeiro de Oreo', 'small', 70),
    ('Cookies and Cream', 'Brigadeiro de Oreo', 'large', 140),
    ('Cookies and Cream', 'Oreo', 'small', 20),
    ('Cookies and Cream', 'Oreo', 'large', 40),
    ('Cookies and Cream', 'Malte Enzimática', 'small', 1),
    ('Cookies and Cream', 'Malte Enzimática', 'large', 2),
    ('Doce de Leite e Banana', 'Farinha Caputo Saccorosso', 'small', 100),
    ('Doce de Leite e Banana', 'Farinha Caputo Saccorosso', 'large', 200),
    ('Doce de Leite e Banana', 'Sal Vatel', 'small', 2),
    ('Doce de Leite e Banana', 'Sal Vatel', 'large', 4),
    ('Doce de Leite e Banana', 'Fermento Fermipan', 'small', 0.50),
    ('Doce de Leite e Banana', 'Fermento Fermipan', 'large', 1),
    ('Doce de Leite e Banana', 'Doce de Leite', 'small', 70),
    ('Doce de Leite e Banana', 'Doce de Leite', 'large', 140),
    ('Doce de Leite e Banana', 'Malte Enzimática', 'small', 1),
    ('Doce de Leite e Banana', 'Malte Enzimática', 'large', 2)
  ) as t(pizza_name, stock_name, size, qty)
)
insert into public.pizza_recipe_items (recipe_id, stock_item_id, size, quantity)
select r.recipe_id, s.id, rows.size::public.pizza_size, rows.qty
from rows
join recipe_by_pizza r on r.pizza_name = rows.pizza_name
join public.stock_items s on s.name = rows.stock_name;
