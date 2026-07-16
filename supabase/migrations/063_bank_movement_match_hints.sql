-- Migration 063: bank_movement_match_hints
--
-- Tabela de learning para conciliação bancária.
-- Guarda associações confirmadas entre descrições bancárias normalizadas
-- e fornecedores, permitindo que reconciliações manuais passadas aumentem
-- a confiança das sugestões automáticas em importações futuras.
--
-- Análoga a supplier_import_hints (migration 062) mas orientada a descrições
-- bancárias em vez de nomes extraídos por IA.

CREATE TABLE IF NOT EXISTS bank_movement_match_hints (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_description text NOT NULL,
  supplier_id     uuid        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  use_count       integer     NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (normalized_description, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_movement_match_hints_desc
  ON bank_movement_match_hints (normalized_description);

COMMENT ON TABLE bank_movement_match_hints IS
  'Learning de conciliação bancária: descrição normalizada → fornecedor confirmado. '
  'use_count incrementa em cada reconciliação manual com o mesmo padrão.';
