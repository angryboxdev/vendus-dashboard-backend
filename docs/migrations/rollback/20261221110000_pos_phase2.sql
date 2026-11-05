-- Rollback de 20261221110000_pos_phase2.sql (POS do Mezza — fase 2).
-- Apaga os movimentos de stock, o contador, os códigos de barras e as vistas
-- preferidas. As vendas (pos_sales) e os documentos fiscais ficam.

drop trigger if exists pos_sales_stock on public.pos_sales;
drop trigger if exists pos_products_guard_stock on public.pos_products;
drop trigger if exists pos_stock_moves_apply on public.pos_stock_moves;
drop trigger if exists pos_stock_moves_immutable on public.pos_stock_moves;
drop trigger if exists pos_stock_moves_no_truncate on public.pos_stock_moves;
drop table if exists public.pos_stock_moves;
drop table if exists public.pos_employee_prefs;
drop function if exists public.pos_sales_stock();
drop function if exists public.pos_products_guard_stock();
drop function if exists public.pos_stock_apply();
drop index if exists public.pos_products_barcode_uq;
alter table public.pos_products drop constraint if exists pos_products_barcode_ck;
alter table public.pos_products drop constraint if exists pos_products_org_id_uq;
alter table public.pos_sales drop constraint if exists pos_sales_org_id_uq;
alter table public.pos_products drop column if exists barcode;
alter table public.pos_products drop column if exists stock_qty;
alter table public.pos_settings drop constraint if exists pos_settings_default_view_ck;
alter table public.pos_settings drop column if exists default_view;
