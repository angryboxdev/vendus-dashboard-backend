-- ATENÇÃO: operação destrutiva no histórico de movimentos.
-- 1) Remove todas as linhas de stock_movements → quantidade atual = 0 para todos os itens
--    (a quantidade na app é SUM(quantity) por item; não há coluna de stock em stock_items).
-- 2) Marca todos os stock_items como is_active = false para atualizares manualmente depois.
--
-- Não apaga itens, categorias, receitas de pizza nem mapeamento Vendus.
-- Faz backup ou export se precisares do histórico de movimentos.
--
-- Executar no Supabase: SQL Editor → colar e Run.

begin;

delete from public.stock_movements;

update public.stock_items
set
  is_active = false,
  updated_at = now();

commit;
