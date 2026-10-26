-- Rollback de 20261128100000_menu_xs_and_sales_vat.sql.
-- (2) Remove as definições: a margem volta a usar a predefinição no código (ou o código anterior, sem margem).
drop table if exists public.menu_costing_settings;

-- (1) O Postgres não remove valores de um enum. Para voltar atrás retiram-se as linhas XS; o valor
-- 'xs' fica no tipo sem efeito (o código anterior só aceita small/large e nunca o escreve).
delete from public.vendus_product_mapping where pizza_size = 'xs';
delete from public.pizza_recipe_items where size = 'xs';
delete from public.pizza_prices where size = 'xs';
