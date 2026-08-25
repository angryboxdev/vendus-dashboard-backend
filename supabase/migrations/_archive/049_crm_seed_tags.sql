-- CRM Module · Seed de Tags Controladas

insert into public.crm_tags (name, description, color, category) values
  -- Feedback
  ('elogiou',             'Cliente elogiou a Angry Box',                          '#16a34a', 'feedback'),
  ('reclamou',            'Cliente fez reclamação',                               '#dc2626', 'feedback'),
  ('feedback_neutro',     'Resposta neutra a contacto',                           '#6b7280', 'feedback'),
  ('review_solicitada',   'Pedido de review já enviado — não repetir',            '#7c3aed', 'feedback'),
  ('promotor',            'Deixou review pública positiva',                       '#059669', 'feedback'),

  -- Comportamento
  ('social_follower',     'Segue o Instagram da Angry Box',                       '#0ea5e9', 'comportamento'),
  ('veio_indicado',       'Novo cliente veio indicado por outro',                 '#f59e0b', 'comportamento'),
  ('indicou_alguem',      'Cliente indicou outro cliente',                        '#f59e0b', 'comportamento'),
  ('fez_evento',          'Fez pedido grande (evento/grupo)',                     '#8b5cf6', 'comportamento'),
  ('cliente_internacional','Cliente internacional / turista',                     '#0284c7', 'comportamento'),

  -- Alerta
  ('frequencia_em_queda', 'VIP/Recorrente com queda de frequência detectada',     '#f97316', 'alerta'),
  ('cancelou',            'Já cancelou pelo menos um pedido',                     '#ef4444', 'alerta'),
  ('hesitou_1a_compra',   'SEG-07: disse que achou caro ou não encontrou o que queria', '#f97316', 'alerta'),
  ('problema_tecnico',    'SEG-07: reportou bug ou problema técnico',             '#ef4444', 'alerta'),

  -- Estado
  ('lead_frio',           'SEG-07 sem conversão após 21 dias — Inativo Definitivo', '#9ca3af', 'estado'),
  ('inativo_definitivo',  'Saiu de toda a comunicação automática',                '#6b7280', 'estado'),
  ('ausencia_justificada','Ausência com motivo explicado (viagem, doença, etc.)', '#a3a3a3', 'estado'),
  ('so_nao_pedi',         'Respondeu que gostou mas simplesmente não voltou',     '#a3a3a3', 'estado'),
  ('consultou_e_respondeu','VIP respondeu com feedback útil ao check-in',         '#16a34a', 'estado')
on conflict (name) do nothing;
