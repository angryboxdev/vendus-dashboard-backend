-- Rollback de 20261118100000_recipe_versions.sql: deixa de gravar versões das fichas técnicas e apaga as
-- versões gravadas (o custo semanal das pizzas fica «Sem versão histórica»). As receitas não mudam.

drop trigger if exists recipe_version_on_item on public.pizza_recipe_items;
drop trigger if exists recipe_version_on_recipe on public.pizza_recipes;
drop trigger if exists recipe_version_on_preparation_item on public.preparation_items;
drop trigger if exists recipe_version_on_preparation on public.preparations;

drop function if exists public.tg_recipe_version_from_item();
drop function if exists public.tg_recipe_version_from_recipe();
drop function if exists public.tg_recipe_version_from_preparation_item();
drop function if exists public.tg_recipe_version_from_preparation();
drop function if exists public.fn_recipe_version_pizza(uuid, uuid);
drop function if exists public.fn_recipe_version_preparation(uuid, uuid);

drop table if exists public.recipe_versions;
