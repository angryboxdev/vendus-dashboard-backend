-- Rollback de 20261201100000_stock_demo_organizations.sql.
-- Remove as ligações aos cenários. As organizações fictícias (is_demo = true, demo_of = null) ficam órfãs e
-- invisíveis (os crons e listagens já ignoram is_demo); apagá-las, se se quiser, é um passo à parte e manual.
drop table if exists public.stock_demo_organizations;
