-- Migração: adicionar cost_center_category_id ao nível da fatura
-- Permite definir um centro de custo padrão por fatura que se propaga a todas as suas linhas.
--
-- APLICAR em: Supabase Dashboard → SQL Editor

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS cost_center_category_id uuid
    REFERENCES cost_center_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN invoices.cost_center_category_id IS
  'Centro de custo (subcategoria) padrão desta fatura. Quando definido, propaga-se a todas as linhas.';
