-- CRM Module · Parâmetros configuráveis (todos os valores de negócio)
-- Alterar aqui → aplica a contactos futuros e recálculos de segmento.
-- NUNCA hardcodar estas regras no código.

insert into public.crm_parameters (key, value, description, category) values

  -- ── Janelas de Segmentação ──────────────────────────────────────────────────
  ('seg01_max_days',      '14',  'SEG-01 Novo: máximo dias desde último pedido',           'segmentação'),
  ('seg02_max_days',      '30',  'SEG-02 Em Ativação: máximo dias desde último pedido',    'segmentação'),
  ('seg03_max_days',      '30',  'SEG-03 Recorrente: máximo dias desde último pedido',     'segmentação'),
  ('seg04_max_days',      '45',  'SEG-04 VIP: máximo dias desde último pedido',            'segmentação'),
  ('seg05_max_days',      '60',  'SEG-05 Em Risco: máximo dias desde último pedido',       'segmentação'),

  -- ── Critérios de Promoção a VIP ─────────────────────────────────────────────
  ('vip_min_orders',      '4',   'Mínimo de pedidos concluídos para VIP',                  'segmentação'),
  ('vip_min_ltv',         '100', 'Mínimo de LTV (€) para VIP',                             'segmentação'),

  -- ── Timings da Régua SEG-01 ─────────────────────────────────────────────────
  ('seg01_days_2_1_2',    '3',   'SEG-01: dias após 1º pedido para script 2.1.2',          'régua'),
  ('seg01_days_2_1_3',    '10',  'SEG-01: dias após 1º pedido para script 2.1.3',          'régua'),
  ('seg01_days_transition','15', 'SEG-01: dias até transição para SEG-02',                  'régua'),

  -- ── Timings da Régua SEG-02 ─────────────────────────────────────────────────
  ('seg02_days_2_2_1',    '18',  'SEG-02: dias após 1º pedido para script 2.2.1',          'régua'),
  ('seg02_days_2_2_2',    '25',  'SEG-02: dias após 1º pedido para script 2.2.2',          'régua'),
  ('seg02_days_transition','31', 'SEG-02: dias até transição para SEG-05',                  'régua'),

  -- ── Timings da Régua SEG-03 ─────────────────────────────────────────────────
  ('seg03_cycle_days',    '21',  'SEG-03: ciclo em dias entre scripts 2.3.2',               'régua'),

  -- ── Timings da Régua SEG-04 ─────────────────────────────────────────────────
  ('seg04_checkin_days',  '60',  'SEG-04: ciclo em dias entre check-ins 2.4.5',             'régua'),
  ('seg04_risk_days',     '25',  'SEG-04: dias sem pedido para disparar CEN-09',            'régua'),

  -- ── Timings da Régua SEG-05 ─────────────────────────────────────────────────
  ('seg05_days_2_5_1',    '35',  'SEG-05 (vindo de Recorrente): dias para script 2.5.1',   'régua'),
  ('seg05_days_2_5_1_vip','50',  'SEG-05 (vindo de VIP): dias para script 2.5.1-VIP',      'régua'),
  ('seg05_days_2_5_2_rec','50',  'SEG-05 (Recorrente): dias para script 2.5.2',            'régua'),
  ('seg05_days_2_5_2_vip','58',  'SEG-05 (VIP): dias para script 2.5.2',                  'régua'),
  ('seg05_days_transition','61', 'SEG-05: dias até transição para SEG-06',                  'régua'),

  -- ── Timings da Régua SEG-06 ─────────────────────────────────────────────────
  ('seg06_days_2_6_1',    '65',  'SEG-06: dias para script 2.6.1 (win-back)',              'régua'),
  ('seg06_sleep_days',    '79',  'SEG-06: dias até dormir contacto (Inativo Definitivo)',   'régua'),

  -- ── Timings da Régua SEG-07 ─────────────────────────────────────────────────
  ('seg07_days_first',    '1',   'SEG-07: dias após registo para 1º contacto (2.7.0/2.7.1)','régua'),
  ('seg07_days_2_7_2',    '7',   'SEG-07: dias após registo para script 2.7.2',            'régua'),
  ('seg07_inactive_days', '21',  'SEG-07: dias sem conversão para Inativo Definitivo',     'régua'),

  -- ── Ofertas ─────────────────────────────────────────────────────────────────
  ('offer_code_2nd_order',      'VOLTA10',    'Código da oferta de 2ª compra (script 2.1.3)',       'ofertas'),
  ('offer_desc_2nd_order',      'sobremesa grátis', 'Descrição da oferta de 2ª compra',             'ofertas'),
  ('offer_validity_2nd_order',  '7',          'Validade em dias da oferta 2ª compra',               'ofertas'),

  ('offer_code_activation',     'VOLTA20',    'Código da oferta de ativação (script 2.2.2)',        'ofertas'),
  ('offer_desc_activation',     '20% off',    'Descrição da oferta de ativação',                   'ofertas'),
  ('offer_validity_activation', '5',          'Validade em dias da oferta de ativação',             'ofertas'),

  ('offer_code_risk',           'REGRESSO',   'Código da oferta Em Risco (script 2.5.2)',           'ofertas'),
  ('offer_desc_risk',           '25% off',    'Descrição da oferta Em Risco',                      'ofertas'),
  ('offer_validity_risk',       '10',         'Validade em dias da oferta Em Risco',                'ofertas'),

  ('offer_code_winback',        'VOLTA40',    'Código win-back Perdido (script 2.6.1)',             'ofertas'),
  ('offer_desc_winback',        '40% off',    'Descrição da oferta win-back',                      'ofertas'),
  ('offer_validity_winback',    '14',         'Validade em dias da oferta win-back',                'ofertas'),

  ('offer_code_welcome',        'BEMVINDO',   'Código de boas-vindas SEG-07 (script 2.7.2)',        'ofertas'),
  ('offer_desc_welcome',        '20% off',    'Descrição da oferta de boas-vindas',                'ofertas'),
  ('offer_validity_welcome',    '14',         'Validade em dias da oferta de boas-vindas',          'ofertas'),

  -- ── Comportamento de Contactos ───────────────────────────────────────────────
  ('max_contacts_per_day',           '1',  'Máximo de contactos por cliente por dia (exceto CRÍTICO)', 'comportamento'),
  ('cooldown_hours',                 '48', 'Cooldown em horas entre contactos comerciais não-críticos', 'comportamento'),
  ('max_commercial_per_week_rec',    '1',  'Máximo de contactos comerciais semanais para Recorrente',   'comportamento'),

  -- ── Tom de Voz ──────────────────────────────────────────────────────────────
  ('voice_language',    'pt-PT',  'Idioma das mensagens',         'tom'),
  ('voice_treatment',   'tu',     'Tratamento (tu/você)',          'tom'),
  ('voice_signature',   'Raul',   'Assinatura padrão',             'tom'),
  ('voice_max_emojis',  '1',      'Máximo de emojis por mensagem', 'tom'),

  -- ── Datas Comemorativas (CEN-11) ─────────────────────────────────────────────
  ('commemorative_dates', '[
    {"name":"Natal",              "month":12,"day":25,"variant":"C","active":true},
    {"name":"Páscoa",             "month":4, "day":20,"variant":"A","active":true},
    {"name":"Dia do Pai",         "month":3, "day":19,"variant":"A","active":true},
    {"name":"Dia da Mãe",         "month":5, "day":1, "variant":"A","active":true},
    {"name":"Dia dos Namorados",  "month":2, "day":14,"variant":"B","active":true},
    {"name":"Aniversário Angry Box","month":1,"day":1,"variant":"B","active":true}
  ]', 'Datas comemorativas para CEN-11 (JSON)', 'datas')

on conflict (key) do nothing;
