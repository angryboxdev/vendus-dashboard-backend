-- Migration 076: corrigir FK de payable_entries.cost_center_id
--
-- O campo cost_center_id em payable_entries apontava para a tabela legada
-- cost_centers. O módulo financial-base usa cost_center_groups (nova tabela).
-- Todas as entradas existentes têm cost_center_id = NULL, pelo que a migração
-- é segura — não há dados a converter.

ALTER TABLE payable_entries
  DROP CONSTRAINT IF EXISTS payable_entries_cost_center_id_fkey;

ALTER TABLE payable_entries
  ADD CONSTRAINT payable_entries_cost_center_id_fkey
  FOREIGN KEY (cost_center_id) REFERENCES cost_center_groups(id) ON DELETE SET NULL;
