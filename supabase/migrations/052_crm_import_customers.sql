-- CRM Module · Importação inicial de clientes do Excel (AngryBox_CRM_Planilha_v3)
-- 38 clientes, orders derivadas do 1º/último pedido + LTV, log de contactos de 21-22/05/2026

-- ─── Clientes ──────────────────────────────────────────────────────────────────
insert into public.crm_customers
  (id, first_name, last_name, email, phone, preferred_channel, opt_in, how_found, registered_at)
values
  ('C001','Taissa',    'Antonio',                  'taissafilipa@gmail.com',             '+351 910 099 638', 'WhatsApp', 'Pendente', null,        '2026-05-11'),
  ('C002','Gabriela',  'Leitr',                    'gabidpleite@yahoo.com.br',            '+351 937 349 426', 'WhatsApp', 'Pendente', null,        '2026-05-17'),
  ('C003','Ian',       'Macdonald',                'imac25@gmail.com',                    '+1 403 818 3394',  'WhatsApp', 'Pendente', null,        '2026-05-14'),
  ('C004','Ivo',       'Moura',                    'godeye@gmail.com',                    '+351 913 418 256', 'WhatsApp', 'Pendente', null,        '2026-05-14'),
  ('C005','Eduarda',   'Dias',                     'duda.d@hotmail.com',                  '+351 910 932 534', 'WhatsApp', 'Pendente', null,        '2026-05-06'),
  ('C006','Guilherme', 'Tavares',                  'guilhermeptavares@gmail.com',          '+351 913 456 132', 'WhatsApp', 'Pendente', null,        '2026-05-16'),
  ('C007','Rui',       'Filipe Monteiro Oliveira', 'rui.oliveira1919@gmail.com',           '+351 933 442 081', 'WhatsApp', 'Pendente', null,        '2026-05-18'),
  ('C008','Nuno',      'Macedo',                   'nunomacedo2001@gmail.com',             '+351 937 774 580', 'WhatsApp', 'Pendente', null,        '2026-05-01'),
  ('C009','Fábio',     'Rodrigues',                'fmr7@live.com',                       '+351 962 735 511', 'WhatsApp', 'Pendente', null,        '2026-05-19'),
  ('C010','Jonathan',  'Grayson',                  'mexicosis@gmail.com',                 '+351 918 346 618', 'WhatsApp', 'Pendente', null,        '2026-05-12'),
  ('C011','Pedro',     'Filipe Alves Azevedo',     'pedro_nn85@hotmail.com',              '+351 932 820 658', 'WhatsApp', 'Pendente', null,        '2026-05-13'),
  ('C012','Mário',     'Teles',                    'ldiotavista@hotmail.com',             '+351 938 410 002', 'WhatsApp', 'Pendente', null,        '2026-05-18'),
  ('C013','Lucas',     'De Souza',                 'lucashenriquedesouzall@gmail.com',     '+351 910 163 565', 'WhatsApp', 'Pendente', null,        '2026-05-16'),
  ('C014','Ana',       'Nogueira',                 'annee.nogueira@hotmail.com',           '+351 915 604 127', 'WhatsApp', 'Pendente', null,        '2026-05-18'),
  ('C015','Alline',    'Bezerra Damato',           'alline_damato14@hotmail.com',          '+351 914 052 895', 'WhatsApp', 'Pendente', null,        '2026-05-15'),
  ('C016','Gustavo',   'Martins',                  'gustavosamartins26@gmail.com',         '+351 961 221 563', 'WhatsApp', 'Pendente', null,        '2026-05-17'),
  ('C017','Plynio',    'Maciel',                   'pliniolp@hotmail.com',                '+351 932 211 524', 'WhatsApp', 'Pendente', null,        '2026-05-03'),
  ('C018','Rodolfo',   'Pereira',                  'rodolfopereira.cct@gmail.com',         '+351 916 435 256', 'WhatsApp', 'Pendente', null,        '2026-05-17'),
  ('C019','Aleksandr', 'Bushlanov',                'bushlanov.alexander@gmail.com',        '+351 961 952 567', 'WhatsApp', 'Pendente', null,        '2026-05-16'),
  ('C020','Danielle',  'Michard',                  'danimichard@gmail.com',               '+351 911 528 565', 'WhatsApp', 'Pendente', null,        '2026-05-16'),
  ('C021','Raquel',    'Moreira',                  'raquelmoreira2010@hotmail.com',        '+351 937 104 591', 'WhatsApp', 'Pendente', null,        '2026-05-12'),
  ('C022','Martim',    'Melo',                     'martimcoelhomelo@gmail.com',           '+351 933 275 899', 'WhatsApp', 'Pendente', null,        '2026-05-19'),
  ('C023','César',     'Igreja',                   'miguel.igreja.99@gmail.com',           '+351 913 243 819', 'WhatsApp', 'Pendente', null,        '2026-05-13'),
  ('C024','Bruno',     'Bessa',                    'brunobomabessa15@gmail.com',           '+351 930 641 102', 'WhatsApp', 'Pendente', null,        '2026-05-17'),
  ('C025','Gustavo',   'Ramos',                    'gustavog4511@gmail.com',              '+351 931 151 916', 'WhatsApp', 'Pendente', null,        '2026-05-16'),
  ('C026','Paula',     'Ogata',                    'ogata.mpaula@gmail.com',              '+351 934 643 510', 'WhatsApp', 'Pendente', null,        '2026-05-13'),
  ('C027','Monica',    'Rossini',                  'nikarossini@gmail.com',               '+351 937 912 378', 'WhatsApp', 'Pendente', null,        '2026-05-19'),
  ('C028','Suzana',    'Machado',                  'suzanamachado@outlook.com',            '+351 914 127 827', 'WhatsApp', 'Pendente', null,        '2026-05-14'),
  ('C029','Jose',      'Guillen',                  'joseluisleonguillen@gmail.com',        '+351 918 302 701', 'WhatsApp', 'Pendente', null,        '2026-05-18'),
  ('C030','Rita',      'Cabral',                   'ritabcabral@live.com.pt',             '+351 913 122 423', 'WhatsApp', 'Pendente', null,        '2026-05-10'),
  ('C031','Mafalda',   'Pinto',                    'mafaldapinto03@gmail.com',            '+351 919 072 569', 'WhatsApp', 'Pendente', null,        '2026-05-14'),
  ('C032','Diana',     'Rocha',                    'dianarodriguesrocha93@gmail.com',      '+351 910 556 525', 'WhatsApp', 'Pendente', null,        '2026-05-21'),
  ('C033','Luigi',     'Silveira',                 'luigifromporto@gmail.com',            '+351 933 756 857', 'WhatsApp', 'Pendente', 'Passagem', '2026-05-21'),
  ('C034','Diogo',     'Duarte Pereira Faria',     'minionpotato17@gmail.com',            '+351 911 585 877', 'WhatsApp', 'Pendente', null,        '2026-05-17'),
  ('C035','Tiago',     'Machado',                  'tiago.mebm.24.07@gmail.com',          '+351 917 709 273', 'WhatsApp', 'Pendente', null,        '2026-05-09'),
  ('C036','Alessia',   'Romero',                   'alessiasoarez@gmail.com',             '+351 916 394 218', 'WhatsApp', 'Pendente', null,        '2026-05-20'),
  ('C037','Bruno',     'Lopes',                    'lopesmcc@gmail.com',                  '+351 936 406 555', 'WhatsApp', 'Pendente', null,        '2026-05-21'),
  ('C038','Rodrigo',   'Moreira',                  'rcmoreira8@gmail.com',                '+351 931 917 129', 'WhatsApp', 'Pendente', null,        '2026-05-21')
on conflict (id) do nothing;

-- ─── SEG-07: marcar caminho ────────────────────────────────────────────────────
-- C032 e C033 têm 0 pedidos → SEG-07
-- C033 respondeu ao email com WhatsApp → provável Caminho A (só criou conta)
-- C032 → Caminho A (sem informação de carrinho)
update public.crm_customers set seg07_path = 'A' where id in ('C032','C033');

-- ─── Pedidos ───────────────────────────────────────────────────────────────────
-- C001: 2 pedidos, LTV 48.48, 1º 2026-05-11, último 2026-05-18
insert into public.crm_orders (customer_id, order_date, total_value) values
  ('C001','2026-05-11', 24.24),
  ('C001','2026-05-18', 24.24),
  ('C002','2026-05-17', 23.62),
  ('C003','2026-05-14', 12.08),
  ('C004','2026-05-14', 23.62),
  ('C005','2026-05-06', 35.17),
  ('C006','2026-05-16', 53.37),
  ('C007','2026-05-18', 22.01),
  ('C008','2026-05-01', 14.76),
  ('C009','2026-05-19', 22.71),
  ('C010','2026-05-12', 17.72),
  ('C011','2026-05-13', 23.62),
  ('C012','2026-05-18', 23.62),
  ('C013','2026-05-16', 35.17),
  ('C014','2026-05-18', 31.57),
  ('C015','2026-05-15', 22.71),
  ('C016','2026-05-17', 22.01),
  ('C017','2026-05-03', 23.62),
  ('C018','2026-05-17', 23.62),
  ('C019','2026-05-16', 24.86),
  ('C020','2026-05-16', 23.09),
  ('C021','2026-05-12', 35.17),
  ('C022','2026-05-19', 23.62),
  ('C023','2026-05-13', 23.62),
  ('C024','2026-05-17', 22.01),
  ('C025','2026-05-16', 26.31),
  ('C026','2026-05-13', 32.64),
  ('C027','2026-05-19', 22.01),
  ('C028','2026-05-14', 22.71),
  ('C029','2026-05-18', 19.72),
  ('C030','2026-05-10', 23.62),
  ('C031','2026-05-14', 22.71),
  -- C032 e C033: sem pedidos (SEG-07)
  ('C034','2026-05-17', 23.62),
  ('C035','2026-05-09', 23.62),
  ('C036','2026-05-20', 18.11),
  ('C037','2026-05-21', 33.56),
  ('C038','2026-05-21', 12.08);

-- ─── Tags (clientes que elogiaram) ────────────────────────────────────────────
insert into public.crm_customer_tags (customer_id, tag_name) values
  ('C003','elogiou'),
  ('C004','elogiou'),
  ('C007','elogiou'),
  ('C009','elogiou'),
  ('C010','elogiou'),
  ('C011','elogiou'),
  ('C016','elogiou'),
  ('C022','elogiou'),
  ('C024','elogiou'),
  ('C028','elogiou'),
  ('C003','cliente_internacional')  -- Ian Macdonald, estava de férias no Canadá
on conflict (customer_id, tag_name) do nothing;

-- ─── Contactos (log de 21-22/05/2026) ─────────────────────────────────────────
-- Normalizar customer IDs para uppercase (log tinha mix c001/C001)
insert into public.crm_contacts
  (customer_id, contacted_at, channel, script_code, direction, status, response, notes, segment_at_time)
values
  -- 21/05
  ('C032','2026-05-21 10:00:00+01','WhatsApp','2.7.0',  'Enviado','Enviado',    null,       null, 'SEG-07'),
  ('C033','2026-05-21 10:00:00+01','Email',   '2.7.0',  'Enviado','Respondeu',  'Positivo', 'Respondeu com número de whatsapp', 'SEG-07'),
  ('C033','2026-05-21 11:00:00+01','WhatsApp','free',   'Enviado','Respondeu',  'Positivo', 'Mandei msg falando sobre a adição da chicken ranch na plataforma, ele respondeu dizendo que proxima semana vai comprar, se nao comprar proxima semana fazer follow up', 'SEG-07'),
  ('C001','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Sem resposta',null,      null, 'SEG-03'),
  ('C002','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Sem resposta',null,      null, 'SEG-01'),
  ('C003','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Positivo', 'Cliente elogiou mas ele é do Canada, estava aqui a férias', 'SEG-01'),
  ('C004','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Positivo', null, 'SEG-01'),
  ('C005','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Neutro',   null, 'SEG-01'),
  ('C006','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C007','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Positivo', null, 'SEG-01'),
  ('C008','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Neutro',   null, 'SEG-01'),
  ('C009','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Positivo', null, 'SEG-01'),
  ('C010','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Positivo', null, 'SEG-01'),
  ('C011','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Positivo', null, 'SEG-01'),
  ('C012','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C013','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C014','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C015','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C016','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Positivo', null, 'SEG-01'),
  ('C017','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Neutro',   null, 'SEG-01'),
  ('C018','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C019','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C020','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C021','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Neutro',   null, 'SEG-01'),
  ('C022','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Positivo', null, 'SEG-01'),
  ('C023','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C024','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Positivo', null, 'SEG-01'),
  ('C025','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C026','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C027','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Neutro',   null, 'SEG-01'),
  ('C028','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Respondeu',  'Positivo', null, 'SEG-01'),
  ('C029','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C030','2026-05-21 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  -- 22/05
  ('C031','2026-05-22 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C036','2026-05-22 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C037','2026-05-22 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C038','2026-05-22 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C034','2026-05-22 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C035','2026-05-22 10:00:00+01','WhatsApp','2.1.1',  'Enviado','Enviado',    null,       null, 'SEG-01'),
  -- 2.1.1.a (pedido de review) após elogios
  ('C003','2026-05-21 11:00:00+01','WhatsApp','CEN-05', 'Enviado','Enviado',    null,       null, 'SEG-01'),
  ('C004','2026-05-21 11:00:00+01','WhatsApp','CEN-05', 'Enviado','Respondeu',  'Positivo', null, 'SEG-01'),
  -- 2.1.2 para C005 (resposta neutra → follow-up social)
  ('C005','2026-05-21 11:00:00+01','WhatsApp','2.1.2',  'Enviado','Enviado',    null,       null, 'SEG-01');

-- ─── Tags por resultado dos contactos ─────────────────────────────────────────
-- CEN-05 enviado → review_solicitada
insert into public.crm_customer_tags (customer_id, tag_name) values
  ('C003','review_solicitada'),
  ('C004','review_solicitada'),
  -- C005 resposta neutra
  ('C005','feedback_neutro')
on conflict (customer_id, tag_name) do nothing;
