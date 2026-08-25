-- =============================================================================
-- Seed: Cost Center Groups, Categories, Suppliers & Sample Invoices
-- Based on task_centros_de_custo_angry_box_hub.docx
-- Idempotent: uses INSERT ... ON CONFLICT DO NOTHING
--
-- ID scheme (deterministic, easy to trace):
--   Groups     10000000-0000-0000-0000-00000000000x
--   Categories 20000000-0000-0000-0000-00000000000x  (x up to 34)
--   Suppliers  30000000-0000-0000-0000-00000000000x
--   Invoices   40000000-0000-0000-0000-00000000000x
-- =============================================================================

-- ── Cost Center Groups (7) ────────────────────────────────────────────────────

INSERT INTO cost_center_groups (id, code, name, description, sort_order, is_active)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'OPD', 'Operação Direta',             'Custos diretamente ligados à produção e venda',                1, true),
  ('10000000-0000-0000-0000-000000000002', 'PES', 'Pessoal',                      'Salários, encargos, extras e serviços terceirizados',          2, true),
  ('10000000-0000-0000-0000-000000000003', 'EST', 'Estrutura & Instalações',      'Custos da loja e infraestrutura física',                      3, true),
  ('10000000-0000-0000-0000-000000000004', 'ADM', 'Administrativo & Financeiro',  'Gestão, sistemas, bancos e contabilidade',                    4, true),
  ('10000000-0000-0000-0000-000000000005', 'MKT', 'Marketing & Comercial',        'Aquisição, marca, promoções e parcerias',                     5, true),
  ('10000000-0000-0000-0000-000000000006', 'CAP', 'Investimentos / CAPEX',        'Equipamentos, obras e ativos de longo prazo',                 6, true),
  ('10000000-0000-0000-0000-000000000007', 'FDR', 'Fora da DRE',                  'Movimentos financeiros que não são despesa operacional',      7, true)
ON CONFLICT (code) DO NOTHING;

-- ── Cost Center Categories (34) ────────────────────────────────────────────────

-- OPD — Operação Direta (6)
INSERT INTO cost_center_categories
  (id, group_id, code, name, financial_type,
   affects_dre, affects_cashflow, affects_profitability,
   requires_channel, requires_allocation, is_active, description)
VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'OPD.01', 'CMV / Ingredientes',       'cmv',           true,  true,  true,  false, false, true,
   'Matérias-primas e ingredientes usados na produção'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   'OPD.02', 'Bebidas',                  'cmv',           true,  true,  true,  false, false, true,
   'Bebidas e outros produtos de revenda direta'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   'OPD.03', 'Embalagens',               'variable_cost', true,  true,  true,  true,  false, true,
   'Embalagens e materiais de entrega'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001',
   'OPD.04', 'Taxas de Apps Delivery',   'variable_cost', true,  true,  true,  true,  false, true,
   'Comissões e taxas das plataformas de delivery'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001',
   'OPD.05', 'Taxas de Pagamento',       'variable_cost', true,  true,  true,  false, false, true,
   'Taxas de terminais e processadores de pagamento'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001',
   'OPD.06', 'Quebras & Desperdícios',   'cmv',           true,  true,  true,  false, false, true,
   'Perdas de ingredientes e produto acabado')
ON CONFLICT (code) DO NOTHING;

-- PES — Pessoal (4)
INSERT INTO cost_center_categories
  (id, group_id, code, name, financial_type,
   affects_dre, affects_cashflow, affects_profitability,
   requires_channel, requires_allocation, is_active, description)
VALUES
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002',
   'PES.01', 'Salários',                 'personnel', true, true, false, false, true, true,
   'Remuneração base mensal dos colaboradores'),
  ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002',
   'PES.02', 'Encargos',                 'personnel', true, true, false, false, true, true,
   'Encargos sociais e contribuições patronais'),
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002',
   'PES.03', 'Extras / Bonificações',    'personnel', true, true, false, false, true, true,
   'Horas extra, subsídios e bónus'),
  ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000002',
   'PES.04', 'Serviços Terceirizados',   'personnel', true, true, false, false, true, true,
   'Prestação de serviços por externos')
ON CONFLICT (code) DO NOTHING;

-- EST — Estrutura & Instalações (6)
INSERT INTO cost_center_categories
  (id, group_id, code, name, financial_type,
   affects_dre, affects_cashflow, affects_profitability,
   requires_channel, requires_allocation, is_active, description)
VALUES
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000003',
   'EST.01', 'Renda / Aluguel',          'fixed_opex', true, true, false, false, true,  true,
   'Arrendamento das instalações'),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000003',
   'EST.02', 'Energia',                  'fixed_opex', true, true, false, false, true,  true,
   'Eletricidade e energia'),
  ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000003',
   'EST.03', 'Água / Gás',               'fixed_opex', true, true, false, false, true,  true,
   'Consumo de água e gás'),
  ('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000003',
   'EST.04', 'Internet / Telecom',       'fixed_opex', true, true, false, false, false, true,
   'Serviços de internet, telefone e comunicações'),
  ('20000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000003',
   'EST.05', 'Limpeza & Higiene',        'fixed_opex', true, true, false, false, false, true,
   'Produtos e serviços de limpeza e higienização'),
  ('20000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000003',
   'EST.06', 'Manutenção',               'fixed_opex', true, true, false, false, false, true,
   'Reparações e manutenção de equipamentos e espaço')
ON CONFLICT (code) DO NOTHING;

-- ADM — Administrativo & Financeiro (5)
INSERT INTO cost_center_categories
  (id, group_id, code, name, financial_type,
   affects_dre, affects_cashflow, affects_profitability,
   requires_channel, requires_allocation, is_active, description)
VALUES
  ('20000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000004',
   'ADM.01', 'Contabilidade',            'administrative', true, true, false, false, false, true,
   'Honorários de contabilidade e revisão de contas'),
  ('20000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000004',
   'ADM.02', 'Software & Sistemas',      'administrative', true, true, false, false, false, true,
   'Subscrições de software e ferramentas digitais'),
  ('20000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000004',
   'ADM.03', 'Taxas Bancárias',          'financial',      true, true, false, false, false, true,
   'Comissões, manutenção de conta e juros bancários'),
  ('20000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000004',
   'ADM.04', 'Jurídico',                 'administrative', true, true, false, false, false, true,
   'Serviços jurídicos e notariais'),
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000004',
   'ADM.05', 'Seguros / Licenças',       'administrative', true, true, false, false, false, true,
   'Seguros, licenças de funcionamento e certificações')
ON CONFLICT (code) DO NOTHING;

-- MKT — Marketing & Comercial (4)
INSERT INTO cost_center_categories
  (id, group_id, code, name, financial_type,
   affects_dre, affects_cashflow, affects_profitability,
   requires_channel, requires_allocation, is_active, description)
VALUES
  ('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000005',
   'MKT.01', 'Anúncios Pagos',           'marketing', true, true, false, false, false, true,
   'Google Ads, Meta Ads e outras plataformas de anúncios'),
  ('20000000-0000-0000-0000-000000000023', '10000000-0000-0000-0000-000000000005',
   'MKT.02', 'Conteúdo / Design / Foto', 'marketing', true, true, false, false, false, true,
   'Produção de conteúdo, design gráfico e fotografia'),
  ('20000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000005',
   'MKT.03', 'Promoções / Ofertas',      'marketing', true, true, true,  true,  false, true,
   'Descontos, campanhas e promoções diretas de venda'),
  ('20000000-0000-0000-0000-000000000025', '10000000-0000-0000-0000-000000000005',
   'MKT.04', 'Parcerias / Influencers',  'marketing', true, true, false, false, false, true,
   'Colaborações, influenciadores e parcerias comerciais')
ON CONFLICT (code) DO NOTHING;

-- CAP — Investimentos / CAPEX (4)
INSERT INTO cost_center_categories
  (id, group_id, code, name, financial_type,
   affects_dre, affects_cashflow, affects_profitability,
   requires_channel, requires_allocation, is_active, description)
VALUES
  ('20000000-0000-0000-0000-000000000026', '10000000-0000-0000-0000-000000000006',
   'CAP.01', 'Equipamentos',             'capex', false, true, false, false, false, true,
   'Compra de equipamentos de cozinha e produção'),
  ('20000000-0000-0000-0000-000000000027', '10000000-0000-0000-0000-000000000006',
   'CAP.02', 'Obras & Melhorias',        'capex', false, true, false, false, false, true,
   'Obras de remodelação e benfeitorias no espaço'),
  ('20000000-0000-0000-0000-000000000028', '10000000-0000-0000-0000-000000000006',
   'CAP.03', 'Hardware',                 'capex', false, true, false, false, false, true,
   'Computadores, tablets, POS e hardware informático'),
  ('20000000-0000-0000-0000-000000000029', '10000000-0000-0000-0000-000000000006',
   'CAP.04', 'Mobiliário',               'capex', false, true, false, false, false, true,
   'Mobiliário, decoração e arranjo do espaço')
ON CONFLICT (code) DO NOTHING;

-- FDR — Fora da DRE (5)
INSERT INTO cost_center_categories
  (id, group_id, code, name, financial_type,
   affects_dre, affects_cashflow, affects_profitability,
   requires_channel, requires_allocation, is_active, description)
VALUES
  ('20000000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000007',
   'FDR.01', 'Retirada de Sócios',       'off_dre',           false, true, false, false, false, true,
   'Participação e retiradas dos sócios / distribuição de lucros'),
  ('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000007',
   'FDR.02', 'Transferências Internas',  'internal_transfer', false, true, false, false, false, true,
   'Movimentos entre contas sem impacto no resultado'),
  ('20000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000007',
   'FDR.03', 'IVA a Recuperar / Pagar', 'fiscal',            false, true, false, false, false, true,
   'Regularizações de IVA com o Estado'),
  ('20000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000007',
   'FDR.04', 'Empréstimos / Financ.',   'financial',         false, true, false, false, false, true,
   'Reembolsos de empréstimos e financiamentos bancários'),
  ('20000000-0000-0000-0000-000000000034', '10000000-0000-0000-0000-000000000007',
   'FDR.05', 'Adiantamentos / Cauções', 'transitory',        false, true, false, false, false, true,
   'Adiantamentos a fornecedores e cauções transitórias')
ON CONFLICT (code) DO NOTHING;

-- ── Suppliers (8) ─────────────────────────────────────────────────────────────

INSERT INTO suppliers
  (id, name, nif, email, phone,
   default_cost_center_group_id, default_cost_center_category_id,
   payment_terms_days, notes, status)
VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    'Makro Portugal SA', '500123456', 'faturacao@makro.pt', '+351 210 000 100',
    '10000000-0000-0000-0000-000000000001',   -- OPD
    '20000000-0000-0000-0000-000000000001',   -- OPD.01 CMV / Ingredientes
    30, 'Fornecedor principal de ingredientes e matérias-primas', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    'Meta Platforms Ireland', NULL, 'billing@meta.com', NULL,
    '10000000-0000-0000-0000-000000000005',   -- MKT
    '20000000-0000-0000-0000-000000000022',   -- MKT.01 Anúncios Pagos
    0, 'Meta Ads — publicidade no Facebook e Instagram', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    'CC Contabilidade Lda', '509876543', 'geral@cccontab.pt', '+351 220 111 222',
    '10000000-0000-0000-0000-000000000004',   -- ADM
    '20000000-0000-0000-0000-000000000017',   -- ADM.01 Contabilidade
    30, 'Escritório de contabilidade — honorários mensais', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    'NOS SA', '503264032', 'empresas@nos.pt', '+351 800 200 200',
    '10000000-0000-0000-0000-000000000003',   -- EST
    '20000000-0000-0000-0000-000000000014',   -- EST.04 Internet / Telecom
    30, 'Internet fibra e serviços de telecomunicações', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000005',
    'EDP Comercial SA', '505284655', 'clientes@edp.pt', '+351 800 500 000',
    '10000000-0000-0000-0000-000000000003',   -- EST
    '20000000-0000-0000-0000-000000000012',   -- EST.02 Energia
    30, 'Fornecimento de energia elétrica', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000006',
    'Uber Eats Portugal', NULL, 'restaurant.support@uber.com', NULL,
    '10000000-0000-0000-0000-000000000001',   -- OPD
    '20000000-0000-0000-0000-000000000004',   -- OPD.04 Taxas de Apps Delivery
    15, 'Taxas de comissão plataforma Uber Eats', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000007',
    'Bolt Food Portugal', NULL, 'restaurants@bolt.eu', NULL,
    '10000000-0000-0000-0000-000000000001',   -- OPD
    '20000000-0000-0000-0000-000000000004',   -- OPD.04 Taxas de Apps Delivery
    15, 'Taxas de comissão plataforma Bolt Food', 'active'
  ),
  (
    '30000000-0000-0000-0000-000000000008',
    'Sócios — Distribuição', NULL, NULL, NULL,
    '10000000-0000-0000-0000-000000000007',   -- FDR
    '20000000-0000-0000-0000-000000000030',   -- FDR.01 Retirada de Sócios
    0, 'Entidade interna para registo de retiradas e distribuição de resultados', 'active'
  )
ON CONFLICT (id) DO NOTHING;

-- ── Sample Invoices (8) ───────────────────────────────────────────────────────
-- Faturas fictícias de exemplo para validar integrações CC → Fornecedor → Fatura
-- Valores em cêntimos

INSERT INTO invoices
  (id, supplier_id, supplier_name, invoice_number, invoice_date, due_date,
   subtotal_without_vat, total_vat, total_with_vat, status, notes)
VALUES
  (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', 'Makro Portugal SA',
    'MAK-2026-4521', '2026-06-01', '2026-07-01',
    324000, 74520, 398520,   -- 3 240 € + IVA 23%
    'pending', 'Compra semanal de ingredientes — Makro Alfragide'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002', 'Meta Platforms Ireland',
    'META-2026-06', '2026-06-01', '2026-06-01',
    45000, 0, 45000,         -- 450 € sem IVA (serviço internacional)
    'paid', 'Meta Ads — campanha junho 2026'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000003', 'CC Contabilidade Lda',
    'CC-2026-053', '2026-06-05', '2026-07-05',
    20000, 4600, 24600,      -- 200 € + IVA 23%
    'pending', 'Honorários contabilidade junho 2026'
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000004', 'NOS SA',
    'NOS-2026-1134', '2026-06-03', '2026-07-03',
    4900, 1127, 6027,        -- 49 € + IVA 23%
    'paid', 'Fatura mensal internet fibra — junho 2026'
  ),
  (
    '40000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000005', 'EDP Comercial SA',
    'EDP-2026-7823', '2026-06-08', '2026-07-08',
    28000, 6440, 34440,      -- 280 € + IVA 23%
    'pending', 'Fatura energia elétrica junho 2026'
  ),
  (
    '40000000-0000-0000-0000-000000000006',
    '30000000-0000-0000-0000-000000000006', 'Uber Eats Portugal',
    'UBER-2026-0611', '2026-06-10', '2026-06-25',
    38500, 0, 38500,         -- 385 € comissões (~30% de 1 283€ vendas)
    'paid', 'Comissões Uber Eats — 1ª quinzena junho 2026'
  ),
  (
    '40000000-0000-0000-0000-000000000007',
    '30000000-0000-0000-0000-000000000008', 'Sócios — Distribuição',
    'SOC-2026-002', '2026-06-15', '2026-06-15',
    200000, 0, 200000,       -- 2 000 € retirada mensal
    'paid', 'Retirada mensal de sócios — junho 2026'
  ),
  (
    '40000000-0000-0000-0000-000000000008',
    '30000000-0000-0000-0000-000000000001', 'Makro Portugal SA',
    'MAK-2026-4702', '2026-06-15', '2026-07-15',
    298000, 68540, 366540,   -- 2 980 € + IVA 23%
    'overdue', 'Compra semanal ingredientes — 2ª quinzena junho 2026'
  )
ON CONFLICT (id) DO NOTHING;
