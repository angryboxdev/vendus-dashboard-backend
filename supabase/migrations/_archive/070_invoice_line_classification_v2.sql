-- Invoice Classification V2
--
-- 1. invoice_lines: novos campos para herança da subcategoria + canal + IA
-- 2. classification_rules: suporte a N regras por fornecedor (por padrão de descrição) + canal
-- 3. cost_center_categories: inserir MKT.05 — Anúncios por Marketplace

-- ── 1. invoice_lines ─────────────────────────────────────────────────────────

ALTER TABLE invoice_lines
  -- Tipo financeiro herdado da subcategoria (nunca editado manualmente pelo user)
  ADD COLUMN IF NOT EXISTS financial_type        text,
  -- Canal de venda (obrigatório quando a subcategoria tiver requires_channel = true)
  ADD COLUMN IF NOT EXISTS channel_id            uuid REFERENCES channels(id) ON DELETE SET NULL,
  -- Espelho das flags da subcategoria (para validação no backend sem re-join)
  ADD COLUMN IF NOT EXISTS requires_channel      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_allocation   boolean NOT NULL DEFAULT false,
  -- Sugestão de classificação por IA
  ADD COLUMN IF NOT EXISTS ai_suggested_category_id uuid REFERENCES cost_center_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_confidence         numeric(5, 4);

-- ── 2. classification_rules ───────────────────────────────────────────────────
--
-- Antes: 1 regra por fornecedor (supplierId único de facto).
-- Agora: N regras por (supplier_id, description_pattern).
-- Cada regra corresponde a um padrão de descrição da linha de fatura.
-- description_pattern = NULL significa "regra genérica do fornecedor" (fallback).

ALTER TABLE classification_rules
  ADD COLUMN IF NOT EXISTS description_pattern  text,
  ADD COLUMN IF NOT EXISTS channel_id           uuid REFERENCES channels(id) ON DELETE SET NULL;

-- Índice para lookup eficiente por fornecedor (com ou sem pattern)
CREATE INDEX IF NOT EXISTS idx_classification_rules_supplier
  ON classification_rules (supplier_id);

-- ── 3. MKT.05 — Anúncios por Marketplace ─────────────────────────────────────
--
-- Grupo MKT já existe com ID determinístico 10000000-0000-0000-0000-000000000005.
-- Próximo código no grupo: MKT.05 (MKT.01 a MKT.04 já existem).

INSERT INTO cost_center_categories
  (id, group_id, code, name, financial_type,
   affects_dre, affects_cashflow, affects_profitability,
   requires_channel, requires_allocation,
   is_active, description)
VALUES (
  '20000000-0000-0000-0000-000000000035',  -- próximo ID livre (categories vão até 034)
  '10000000-0000-0000-0000-000000000005',  -- grupo MKT
  'MKT.05',
  'Anúncios por Marketplace',
  'marketing',
  true,   -- affects_dre
  true,   -- affects_cashflow
  true,   -- affects_profitability
  true,   -- requires_channel (ex: Uber Eats, Glovo)
  false,  -- requires_allocation
  true,
  'Custos de anúncios pagos dentro de plataformas como Uber Eats, Glovo e Bolt Food.'
)
ON CONFLICT (code) DO NOTHING;
