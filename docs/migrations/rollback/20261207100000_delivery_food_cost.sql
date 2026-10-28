-- Rollback de 20261207100000_delivery_food_cost.sql: apaga os mapeamentos dos produtos do delivery e a
-- coluna dos produtos do SAF-T (o custo real volta à estimativa de 30%).

drop table if exists public.delivery_product_mappings;

alter table public.delivery_platform_statements
  drop column if exists products;
