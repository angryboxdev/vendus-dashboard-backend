-- Local dev fixtures: CRM data (customers, tags, scripts, parameters,
-- contacts, actions). All customer names are invented.

-- ---------------------------------------------------------------------
-- crm_tags
-- ---------------------------------------------------------------------
insert into crm_tags (name, description, color, category, label, active) values
  ('VIP', 'Cliente de alto valor', '#F59E0B', 'estado', 'VIP', true),
  ('Reclamação', 'Cliente com reclamação em aberto', '#DC2626', 'alerta', 'Reclamação', true),
  ('Feedback Positivo', 'Deixou feedback positivo recentemente', '#16A34A', 'feedback', 'Feedback Positivo', true),
  ('Recorrente', 'Compra com regularidade', '#2563EB', 'comportamento', 'Recorrente', true),
  ('Novo Cliente', 'Registado nos últimos 30 dias', '#6B7280', 'estado', 'Novo Cliente', true),
  ('Aniversário Este Mês', 'Aniversário no mês corrente', '#8B5CF6', 'geral', 'Aniversário Este Mês', true);

-- ---------------------------------------------------------------------
-- crm_action_types
-- ---------------------------------------------------------------------
insert into crm_action_types (code, name, color, active, system) values
  ('CALL', 'Ligar', '#2563EB', true, false),
  ('WHATSAPP', 'Enviar WhatsApp', '#16A34A', true, false),
  ('EMAIL', 'Enviar Email', '#6B7280', true, false),
  ('BIRTHDAY', 'Aniversário', '#8B5CF6', true, true),
  ('FOLLOWUP', 'Follow-up Pós-Venda', '#F59E0B', true, false);

-- ---------------------------------------------------------------------
-- crm_scripts
-- ---------------------------------------------------------------------
insert into crm_scripts (code, name, segment, body, channel, trigger_timing, one_shot, cooldown_days, active) values
  ('WELCOME01', 'Boas-vindas Novo Cliente', 'novo', 'Olá {{first_name}}, bem-vindo à Angrybox! 🍕', 'WhatsApp', 'on_signup', true, null, true),
  ('BDAY01', 'Aniversário', null, 'Parabéns {{first_name}}! Aqui está um desconto especial no teu dia 🎉', 'WhatsApp', 'on_birthday', false, 365, true),
  ('WINBACK01', 'Reconquista Cliente Inativo', 'inativo', 'Sentimos a tua falta, {{first_name}}! Volta com 10% de desconto.', 'Email', 'on_inactivity', false, 90, true),
  ('FEEDBACK01', 'Pedido de Feedback', null, 'Como foi a tua experiência, {{first_name}}?', 'WhatsApp', 'post_order', false, 30, true);

-- ---------------------------------------------------------------------
-- crm_parameters
-- ---------------------------------------------------------------------
insert into crm_parameters (key, value, description, category) values
  ('default_currency', 'EUR', 'Moeda usada nos relatórios de CRM', 'geral'),
  ('loyalty_points_per_euro', '1', 'Pontos de fidelização atribuídos por euro gasto', 'fidelizacao'),
  ('inactivity_days_threshold', '60', 'Dias sem compra para considerar cliente inativo', 'segmentacao'),
  ('default_discount_pct', '10', 'Desconto padrão em campanhas de reconquista', 'marketing');

-- ---------------------------------------------------------------------
-- crm_customers (id is text, no default -- ids assigned here)
-- ---------------------------------------------------------------------
insert into crm_customers (
  id, first_name, last_name, email, phone, preferred_channel, birthday,
  how_found, opt_in, notes, inactive, registered_at
) values
  ('CUST0001', 'Marta', 'Oliveira Silva', 'marta.oliveira@example.com', '+351912000001', 'WhatsApp', '1990-05-14', 'Redes Sociais', 'Sim', null, false, current_date - 200),
  ('CUST0002', 'João', 'Pedro Almeida', 'joao.almeida@example.com', '+351912000002', 'WhatsApp', '1985-11-02', 'Walk-in', 'Pendente', null, false, current_date - 150),
  ('CUST0003', 'Beatriz', 'Sousa Martins', 'beatriz.martins@example.com', '+351912000003', 'Email', '1993-07-22', 'Indicação', 'Sim', 'Indicada pela Marta', false, current_date - 90),
  ('CUST0004', 'Ricardo', 'Manuel Teixeira', 'ricardo.teixeira@example.com', '+351912000004', 'SMS', '1979-02-28', 'Passagem', 'Não', 'Não voltou desde a primeira visita', true, current_date - 400),
  ('CUST0005', 'Sara', 'Isabel Cardoso', 'sara.cardoso@example.com', '+351912000005', 'WhatsApp', '2000-09-09', 'Outro', 'Sim', null, false, current_date - 60),
  ('CUST0006', 'Miguel', 'Ângelo Ferreira', 'miguel.ferreira@example.com', '+351912000006', 'WhatsApp', '1996-12-19', 'Redes Sociais', 'Pendente', null, false, current_date - 30),
  ('CUST0007', 'Inês', 'Raquel Gonçalves', 'ines.goncalves@example.com', '+351912000007', 'Email', '1988-03-11', 'Indicação', 'Sim', 'Indicada pela Beatriz', false, current_date - 20),
  ('CUST0008', 'Tiago', 'Filipe Rodrigues', 'tiago.rodrigues@example.com', '+351912000008', 'WhatsApp', '1997-06-25', 'Walk-in', 'Sim', null, false, current_date - 5);

update crm_customers set referred_by = 'CUST0001' where id = 'CUST0003';
update crm_customers set referred_by = 'CUST0003' where id = 'CUST0007';

-- ---------------------------------------------------------------------
-- crm_customer_tags
-- ---------------------------------------------------------------------
insert into crm_customer_tags (customer_id, tag_name) values
  ('CUST0001', 'VIP'),
  ('CUST0001', 'Recorrente'),
  ('CUST0003', 'Recorrente'),
  ('CUST0004', 'Reclamação'),
  ('CUST0006', 'Novo Cliente'),
  ('CUST0008', 'Novo Cliente'),
  ('CUST0005', 'Feedback Positivo');

-- ---------------------------------------------------------------------
-- crm_contacts
-- ---------------------------------------------------------------------
insert into crm_contacts (customer_id, contacted_at, channel, script_code, direction, status, response, notes, segment_at_time) values
  ('CUST0001', now() - interval '30 days', 'WhatsApp', 'WELCOME01', 'Enviado', 'Lido', 'Positivo', null, 'novo'),
  ('CUST0003', now() - interval '10 days', 'WhatsApp', 'FEEDBACK01', 'Enviado', 'Respondeu', 'Positivo', 'Elogiou o tempo de entrega', 'recorrente'),
  ('CUST0004', now() - interval '5 days', 'Email', 'WINBACK01', 'Enviado', 'Não Respondeu', 'Sem Resposta', null, 'inativo'),
  ('CUST0006', now() - interval '2 days', 'WhatsApp', 'WELCOME01', 'Enviado', 'Entregue', null, null, 'novo'),
  ('CUST0005', now() - interval '1 days', 'WhatsApp', null, 'Recebido', null, 'Positivo', 'Perguntou sobre pizzas vegetarianas', 'ativo');

-- ---------------------------------------------------------------------
-- crm_customer_actions
-- ---------------------------------------------------------------------
insert into crm_customer_actions (customer_id, action_type_code, status, scheduled_for, completed_at, notes, script_code) values
  ('CUST0004', 'CALL', 'pending', now() + interval '1 day', null, 'Ligar para perceber motivo da reclamação', null),
  ('CUST0002', 'FOLLOWUP', 'pending', now() + interval '2 days', null, null, 'FEEDBACK01'),
  ('CUST0001', 'BIRTHDAY', 'completed', now() - interval '20 days', now() - interval '20 days', 'Mensagem de aniversário enviada', 'BDAY01'),
  ('CUST0006', 'WHATSAPP', 'completed', now() - interval '2 days', now() - interval '2 days', 'Boas-vindas enviadas', 'WELCOME01'),
  ('CUST0008', 'EMAIL', 'cancelled', now() - interval '3 days', null, 'Cliente pediu para não ser contactado', null);
