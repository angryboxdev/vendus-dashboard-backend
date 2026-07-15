-- Tabela de hints nome→fornecedor para importação de faturas.
-- Cada vez que o utilizador confirma manualmente um fornecedor durante a
-- importação, o nome extraído pela IA é guardado aqui normalizado.
-- Em importações futuras, este hint é consultado antes do fuzzy matching,
-- tornando a sugestão mais fiável e sem custo de LLM extra.

CREATE TABLE supplier_import_hints (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name TEXT      NOT NULL,
  supplier_id  UUID        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  use_count    INTEGER     NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (normalized_name, supplier_id)
);

CREATE INDEX idx_supplier_import_hints_normalized_name
  ON supplier_import_hints (normalized_name);
