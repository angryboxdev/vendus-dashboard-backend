-- Rollback de 20261221100000_pos_phase1.sql (POS do Mezza — fase 1).
-- Apaga produtos, configuração e o registo das vendas do POS. Os documentos
-- fiscais (invoicing_documents) ficam — são imutáveis e não dependem disto.

drop trigger if exists pos_sales_immutable on public.pos_sales;
drop trigger if exists pos_sales_no_truncate on public.pos_sales;
drop table if exists public.pos_sales;
drop table if exists public.pos_settings;
drop table if exists public.pos_products;
