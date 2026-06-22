-- =============================================================================
-- Re-seed: Fornecedores, Regras de Classificação, Faturas + Linhas + Pagamentos
--
-- Remove todos os dados fictícios anteriores e re-popula com dados coerentes:
--   Fornecedor → defaultCostCenterCategory → ClassificationRule
--   Fatura → InvoiceLines (com cost_center_category_id) → PayableEntry
--
-- ID scheme (deterministic):
--   Suppliers          30000000-0000-0000-0000-00000000000x  (mantidos da 056)
--   ClassifRules       70000000-0000-0000-0000-00000000000x
--   Invoices           40000000-0000-0000-0000-00000000000x
--   Invoice Lines      60000000-0000-0000-0000-00000000000x
--   Payable Entries    50000000-0000-0000-0000-00000000000x
-- =============================================================================

-- ── 1. Limpar dados anteriores (ordem respeita FK) ────────────────────────────

DELETE FROM payable_entries;
DELETE FROM invoice_lines;
DELETE FROM invoices;
DELETE FROM classification_rules;
DELETE FROM suppliers;

-- ── 2. Fornecedores (8) ───────────────────────────────────────────────────────
-- Cada fornecedor tem default_cost_center_group_id + default_cost_center_category_id

INSERT INTO suppliers
  (id, name, nif, email, phone,
   default_cost_center_group_id, default_cost_center_category_id,
   payment_terms_days, notes, status)
VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    'Makro Portugal SA', '500123456', 'faturacao@makro.pt', '+351 210 000 100',
    '10000000-0000-0000-0000-000000000001',   -- OPD — Operação Direta
    '20000000-0000-0000-0000-000000000001',   -- OPD.01 CMV / Ingredientes
    30, 'Fornecedor principal de ingredientes e matérias-primas', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    'Meta Platforms Ireland', NULL, 'billing@meta.com', NULL,
    '10000000-0000-0000-0000-000000000005',   -- MKT — Marketing & Comercial
    '20000000-0000-0000-0000-000000000022',   -- MKT.01 Anúncios Pagos
    0, 'Meta Ads — publicidade no Facebook e Instagram', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    'CC Contabilidade Lda', '509876543', 'geral@cccontab.pt', '+351 220 111 222',
    '10000000-0000-0000-0000-000000000004',   -- ADM — Administrativo & Financeiro
    '20000000-0000-0000-0000-000000000017',   -- ADM.01 Contabilidade
    30, 'Escritório de contabilidade — honorários mensais', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    'NOS SA', '503264032', 'empresas@nos.pt', '+351 800 200 200',
    '10000000-0000-0000-0000-000000000003',   -- EST — Estrutura & Instalações
    '20000000-0000-0000-0000-000000000014',   -- EST.04 Internet / Telecom
    30, 'Internet fibra e serviços de telecomunicações', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000005',
    'EDP Comercial SA', '505284655', 'clientes@edp.pt', '+351 800 500 000',
    '10000000-0000-0000-0000-000000000003',   -- EST — Estrutura & Instalações
    '20000000-0000-0000-0000-000000000012',   -- EST.02 Energia
    30, 'Fornecimento de energia elétrica', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000006',
    'Uber Eats Portugal', NULL, 'restaurant.support@uber.com', NULL,
    '10000000-0000-0000-0000-000000000001',   -- OPD — Operação Direta
    '20000000-0000-0000-0000-000000000004',   -- OPD.04 Taxas de Apps Delivery
    15, 'Taxas de comissão plataforma Uber Eats', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000007',
    'Bolt Food Portugal', NULL, 'restaurants@bolt.eu', NULL,
    '10000000-0000-0000-0000-000000000001',   -- OPD — Operação Direta
    '20000000-0000-0000-0000-000000000004',   -- OPD.04 Taxas de Apps Delivery
    15, 'Taxas de comissão plataforma Bolt Food', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000008',
    'Sócios — Distribuição', NULL, NULL, NULL,
    '10000000-0000-0000-0000-000000000007',   -- FDR — Fora da DRE
    '20000000-0000-0000-0000-000000000030',   -- FDR.01 Retirada de Sócios
    0, 'Entidade interna para registo de retiradas e distribuição de resultados', 'active'
  );

-- ── 3. Regras de classificação (7) ────────────────────────────────────────────
-- Uma regra por fornecedor operacional.
-- Permitem sugestão automática no painel de classificação de linhas.

INSERT INTO classification_rules
  (id, supplier_id, default_cost_center_id, default_cost_center_category_id,
   default_line_type, default_category, confidence_boost,
   created_at, updated_at)
VALUES
  -- Makro → stock_purchase, OPD.01
  ('70000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001',
   NULL, '20000000-0000-0000-0000-000000000001',
   'stock_purchase', 'CMV / Ingredientes', 50,
   now(), now()),

  -- Meta → operational_expense, MKT.01
  ('70000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000002',
   NULL, '20000000-0000-0000-0000-000000000022',
   'operational_expense', 'Anúncios Pagos', 80,
   now(), now()),

  -- CC Contabilidade → service, ADM.01
  ('70000000-0000-0000-0000-000000000003',
   '30000000-0000-0000-0000-000000000003',
   NULL, '20000000-0000-0000-0000-000000000017',
   'service', 'Contabilidade', 100,
   now(), now()),

  -- NOS → service, EST.04
  ('70000000-0000-0000-0000-000000000004',
   '30000000-0000-0000-0000-000000000004',
   NULL, '20000000-0000-0000-0000-000000000014',
   'service', 'Internet / Telecom', 100,
   now(), now()),

  -- EDP → service, EST.02
  ('70000000-0000-0000-0000-000000000005',
   '30000000-0000-0000-0000-000000000005',
   NULL, '20000000-0000-0000-0000-000000000012',
   'service', 'Energia', 100,
   now(), now()),

  -- Uber Eats → operational_expense, OPD.04
  ('70000000-0000-0000-0000-000000000006',
   '30000000-0000-0000-0000-000000000006',
   NULL, '20000000-0000-0000-0000-000000000004',
   'operational_expense', 'Taxas de Apps Delivery', 80,
   now(), now()),

  -- Bolt Food → operational_expense, OPD.04
  ('70000000-0000-0000-0000-000000000007',
   '30000000-0000-0000-0000-000000000007',
   NULL, '20000000-0000-0000-0000-000000000004',
   'operational_expense', 'Taxas de Apps Delivery', 80,
   now(), now());

-- ── 4. Faturas (9) ────────────────────────────────────────────────────────────
-- Valores em cêntimos. 3 status: pending, paid, overdue.

INSERT INTO invoices
  (id, supplier_id, supplier_name, invoice_number, invoice_date, due_date, paid_at,
   subtotal_without_vat, total_vat, total_with_vat, status, notes)
VALUES
  -- 1. Makro — compra semanal ingredientes (PENDING)
  ('40000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'Makro Portugal SA',
   'MAK-2026-4521', '2026-06-02', '2026-07-02', NULL,
   22850, 2663, 25513,
   'pending', 'Compra semanal ingredientes — Makro Alfragide'),

  -- 2. Meta — campanha junho (PAID)
  ('40000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000002', 'Meta Platforms Ireland',
   'META-2026-06', '2026-06-01', '2026-06-01', '2026-06-05',
   45000, 0, 45000,
   'paid', 'Meta Ads — campanha junho 2026'),

  -- 3. CC Contabilidade — honorários junho (PENDING)
  ('40000000-0000-0000-0000-000000000003',
   '30000000-0000-0000-0000-000000000003', 'CC Contabilidade Lda',
   'CC-2026-053', '2026-06-05', '2026-07-05', NULL,
   20000, 4600, 24600,
   'pending', 'Honorários contabilidade junho 2026'),

  -- 4. NOS — fatura mensal (PAID)
  ('40000000-0000-0000-0000-000000000004',
   '30000000-0000-0000-0000-000000000004', 'NOS SA',
   'NOS-2026-1134', '2026-06-03', '2026-07-03', '2026-06-10',
   4900, 1127, 6027,
   'paid', 'Internet fibra 1Gbps + linha telefónica — junho 2026'),

  -- 5. EDP — energia junho (PENDING)
  ('40000000-0000-0000-0000-000000000005',
   '30000000-0000-0000-0000-000000000005', 'EDP Comercial SA',
   'EDP-2026-7823', '2026-06-08', '2026-07-08', NULL,
   28000, 6440, 34440,
   'pending', 'Energia elétrica — junho 2026'),

  -- 6. Uber Eats — comissões 1ª quinzena (PAID)
  ('40000000-0000-0000-0000-000000000006',
   '30000000-0000-0000-0000-000000000006', 'Uber Eats Portugal',
   'UBER-2026-0611', '2026-06-10', '2026-06-25', '2026-06-25',
   38500, 0, 38500,
   'paid', 'Comissões Uber Eats — 1ª quinzena junho 2026'),

  -- 7. Bolt Food — comissões 1ª quinzena (PAID)
  ('40000000-0000-0000-0000-000000000007',
   '30000000-0000-0000-0000-000000000007', 'Bolt Food Portugal',
   'BOLT-2026-0611', '2026-06-10', '2026-06-25', '2026-06-25',
   24000, 0, 24000,
   'paid', 'Comissões Bolt Food — 1ª quinzena junho 2026'),

  -- 8. Makro — 2ª compra semanal (OVERDUE — vencida a 15 jun, hoje 22 jun)
  ('40000000-0000-0000-0000-000000000008',
   '30000000-0000-0000-0000-000000000001', 'Makro Portugal SA',
   'MAK-2026-4702', '2026-06-09', '2026-06-15', NULL,
   24880, 1982, 26862,
   'overdue', 'Compra semanal ingredientes + bebidas — 2ª quinzena junho 2026'),

  -- 9. Sócios — retirada mensal (PAID)
  ('40000000-0000-0000-0000-000000000009',
   '30000000-0000-0000-0000-000000000008', 'Sócios — Distribuição',
   'SOC-2026-002', '2026-06-15', '2026-06-15', '2026-06-15',
   200000, 0, 200000,
   'paid', 'Retirada mensal de sócios — junho 2026');

-- ── 5. Linhas de fatura (16) ──────────────────────────────────────────────────
-- Todas as linhas têm cost_center_category_id para ligar ao novo schema.
-- Valores em cêntimos.

INSERT INTO invoice_lines
  (id, invoice_id, description, type,
   cost_center_id, cost_center_category_id,
   category, subcategory, stock_item_id,
   quantity, unit, unit_cost_without_vat, vat_rate, vat_amount, total_with_vat,
   stock_entry_id, created_at)
VALUES
  -- === Fatura 1: Makro MAK-2026-4521 (3 linhas) ===
  -- Carne picada 80/20 — OPD.01 CMV/Ingredientes
  ('60000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001',
   'Carne picada 80/20', 'stock_purchase',
   NULL, '20000000-0000-0000-0000-000000000001',
   'CMV / Ingredientes', NULL, NULL,
   10, 'kg', 1200, 6, 720, 12720,
   NULL, now()),

  -- Batatas fritas congeladas — OPD.01 CMV/Ingredientes
  ('60000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000001',
   'Batatas fritas congeladas', 'stock_purchase',
   NULL, '20000000-0000-0000-0000-000000000001',
   'CMV / Ingredientes', NULL, NULL,
   5, 'saco 5kg', 650, 6, 195, 3445,
   NULL, now()),

  -- Embalagens kraft burger — OPD.03 Embalagens
  ('60000000-0000-0000-0000-000000000003',
   '40000000-0000-0000-0000-000000000001',
   'Embalagens kraft burger', 'stock_purchase',
   NULL, '20000000-0000-0000-0000-000000000003',
   'Embalagens', NULL, NULL,
   200, 'un', 38, 23, 1748, 9348,
   NULL, now()),

  -- === Fatura 2: Meta META-2026-06 (1 linha) ===
  -- Meta Ads campanha junho — MKT.01 Anúncios Pagos
  ('60000000-0000-0000-0000-000000000004',
   '40000000-0000-0000-0000-000000000002',
   'Meta Ads — campanha junho 2026', 'operational_expense',
   NULL, '20000000-0000-0000-0000-000000000022',
   'Anúncios Pagos', NULL, NULL,
   1, NULL, 45000, 0, 0, 45000,
   NULL, now()),

  -- === Fatura 3: CC Contabilidade CC-2026-053 (1 linha) ===
  -- Honorários contabilidade — ADM.01 Contabilidade
  ('60000000-0000-0000-0000-000000000005',
   '40000000-0000-0000-0000-000000000003',
   'Honorários contabilidade mensal', 'service',
   NULL, '20000000-0000-0000-0000-000000000017',
   'Contabilidade', NULL, NULL,
   1, 'mês', 20000, 23, 4600, 24600,
   NULL, now()),

  -- === Fatura 4: NOS NOS-2026-1134 (1 linha) ===
  -- Internet fibra — EST.04 Internet/Telecom
  ('60000000-0000-0000-0000-000000000006',
   '40000000-0000-0000-0000-000000000004',
   'Internet fibra 1Gbps + linha telefónica', 'service',
   NULL, '20000000-0000-0000-0000-000000000014',
   'Internet / Telecom', NULL, NULL,
   1, 'mês', 4900, 23, 1127, 6027,
   NULL, now()),

  -- === Fatura 5: EDP EDP-2026-7823 (2 linhas) ===
  -- Energia elétrica — EST.02 Energia
  ('60000000-0000-0000-0000-000000000007',
   '40000000-0000-0000-0000-000000000005',
   'Energia elétrica (consumo)', 'service',
   NULL, '20000000-0000-0000-0000-000000000012',
   'Energia', NULL, NULL,
   1, 'mês', 24500, 23, 5635, 30135,
   NULL, now()),

  -- Taxa de acesso à rede — EST.02 Energia
  ('60000000-0000-0000-0000-000000000008',
   '40000000-0000-0000-0000-000000000005',
   'Taxa de acesso à rede elétrica', 'service',
   NULL, '20000000-0000-0000-0000-000000000012',
   'Energia', NULL, NULL,
   1, 'mês', 3500, 23, 805, 4305,
   NULL, now()),

  -- === Fatura 6: Uber Eats UBER-2026-0611 (1 linha) ===
  -- Comissões delivery — OPD.04 Taxas de Apps Delivery
  ('60000000-0000-0000-0000-000000000009',
   '40000000-0000-0000-0000-000000000006',
   'Comissões Uber Eats — 1ª quinzena junho', 'operational_expense',
   NULL, '20000000-0000-0000-0000-000000000004',
   'Taxas de Apps Delivery', NULL, NULL,
   1, 'quinzena', 38500, 0, 0, 38500,
   NULL, now()),

  -- === Fatura 7: Bolt Food BOLT-2026-0611 (1 linha) ===
  -- Comissões delivery — OPD.04 Taxas de Apps Delivery
  ('60000000-0000-0000-0000-000000000010',
   '40000000-0000-0000-0000-000000000007',
   'Comissões Bolt Food — 1ª quinzena junho', 'operational_expense',
   NULL, '20000000-0000-0000-0000-000000000004',
   'Taxas de Apps Delivery', NULL, NULL,
   1, 'quinzena', 24000, 0, 0, 24000,
   NULL, now()),

  -- === Fatura 8: Makro MAK-2026-4702 (3 linhas — OVERDUE) ===
  -- Pão brioche hambúrguer — OPD.01 CMV/Ingredientes
  ('60000000-0000-0000-0000-000000000011',
   '40000000-0000-0000-0000-000000000008',
   'Pão brioche hambúrguer', 'stock_purchase',
   NULL, '20000000-0000-0000-0000-000000000001',
   'CMV / Ingredientes', NULL, NULL,
   10, 'pack 10un', 1500, 6, 900, 15900,
   NULL, now()),

  -- Bebidas refrigerantes — OPD.02 Bebidas
  ('60000000-0000-0000-0000-000000000012',
   '40000000-0000-0000-0000-000000000008',
   'Bebidas refrigerantes (sortido)', 'stock_purchase',
   NULL, '20000000-0000-0000-0000-000000000002',
   'Bebidas', NULL, NULL,
   24, 'un', 120, 23, 662, 3542,
   NULL, now()),

  -- Molhos condimentos — OPD.01 CMV/Ingredientes
  ('60000000-0000-0000-0000-000000000013',
   '40000000-0000-0000-0000-000000000008',
   'Molhos condimentos (sortido)', 'stock_purchase',
   NULL, '20000000-0000-0000-0000-000000000001',
   'CMV / Ingredientes', NULL, NULL,
   20, 'frasco', 350, 6, 420, 7420,
   NULL, now()),

  -- === Fatura 9: Sócios SOC-2026-002 (1 linha) ===
  -- Retirada mensal — FDR.01 Retirada de Sócios
  ('60000000-0000-0000-0000-000000000014',
   '40000000-0000-0000-0000-000000000009',
   'Retirada mensal de sócios', 'other',
   NULL, '20000000-0000-0000-0000-000000000030',
   'Retirada de Sócios', NULL, NULL,
   1, NULL, 200000, 0, 0, 200000,
   NULL, now());

-- ── 6. Pagamentos a Pagar (8) ─────────────────────────────────────────────────
-- Pending: faturas 1, 3, 5 + overdue: fatura 8.
-- Paid: faturas 2, 4, 6, 7, 9 (para mostrar histórico no módulo Pagar).

INSERT INTO payable_entries
  (id, invoice_id, supplier_id, supplier_name, description,
   cost_center_id, category, amount, due_date, paid_at,
   recurrence, status, notes, created_at, updated_at)
VALUES
  -- Fatura 1: Makro ingredientes (PENDING)
  ('50000000-0000-0000-0000-000000000001',
   '40000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'Makro Portugal SA',
   'MAK-2026-4521 — Ingredientes e embalagens',
   NULL, 'CMV / Ingredientes',
   25513, '2026-07-02', NULL,
   'none', 'pending', NULL, now(), now()),

  -- Fatura 2: Meta Ads (PAID)
  ('50000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000002', 'Meta Platforms Ireland',
   'META-2026-06 — Meta Ads campanha junho',
   NULL, 'Anúncios Pagos',
   45000, '2026-06-01', '2026-06-05',
   'none', 'paid', NULL, now(), now()),

  -- Fatura 3: CC Contabilidade (PENDING)
  ('50000000-0000-0000-0000-000000000003',
   '40000000-0000-0000-0000-000000000003',
   '30000000-0000-0000-0000-000000000003', 'CC Contabilidade Lda',
   'CC-2026-053 — Honorários contabilidade junho',
   NULL, 'Contabilidade',
   24600, '2026-07-05', NULL,
   'none', 'pending', NULL, now(), now()),

  -- Fatura 4: NOS (PAID)
  ('50000000-0000-0000-0000-000000000004',
   '40000000-0000-0000-0000-000000000004',
   '30000000-0000-0000-0000-000000000004', 'NOS SA',
   'NOS-2026-1134 — Internet fibra junho',
   NULL, 'Internet / Telecom',
   6027, '2026-07-03', '2026-06-10',
   'none', 'paid', NULL, now(), now()),

  -- Fatura 5: EDP (PENDING)
  ('50000000-0000-0000-0000-000000000005',
   '40000000-0000-0000-0000-000000000005',
   '30000000-0000-0000-0000-000000000005', 'EDP Comercial SA',
   'EDP-2026-7823 — Energia elétrica junho',
   NULL, 'Energia',
   34440, '2026-07-08', NULL,
   'none', 'pending', NULL, now(), now()),

  -- Fatura 6: Uber Eats (PAID)
  ('50000000-0000-0000-0000-000000000006',
   '40000000-0000-0000-0000-000000000006',
   '30000000-0000-0000-0000-000000000006', 'Uber Eats Portugal',
   'UBER-2026-0611 — Comissões 1ª quinzena junho',
   NULL, 'Taxas de Apps Delivery',
   38500, '2026-06-25', '2026-06-25',
   'none', 'paid', NULL, now(), now()),

  -- Fatura 7: Bolt Food (PAID)
  ('50000000-0000-0000-0000-000000000007',
   '40000000-0000-0000-0000-000000000007',
   '30000000-0000-0000-0000-000000000007', 'Bolt Food Portugal',
   'BOLT-2026-0611 — Comissões 1ª quinzena junho',
   NULL, 'Taxas de Apps Delivery',
   24000, '2026-06-25', '2026-06-25',
   'none', 'paid', NULL, now(), now()),

  -- Fatura 8: Makro vencida (OVERDUE)
  ('50000000-0000-0000-0000-000000000008',
   '40000000-0000-0000-0000-000000000008',
   '30000000-0000-0000-0000-000000000001', 'Makro Portugal SA',
   'MAK-2026-4702 — Ingredientes + bebidas (VENCIDA)',
   NULL, 'CMV / Ingredientes',
   26862, '2026-06-15', NULL,
   'none', 'overdue', 'Fatura vencida — pagamento em atraso', now(), now());
