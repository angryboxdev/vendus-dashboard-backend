-- Local dev fixtures: CRM data (customers, tags, scripts, parameters,
-- contacts, actions). All customer names are invented.
--
-- org_id below is Angrybox's fixed UUID (20260822143602_tenant_root_tables.sql).
-- Ticket 21 dropped the org_id column default, so every insert here now
-- names it explicitly -- these fixtures are a write path like any other.

-- ---------------------------------------------------------------------
-- crm_tags
-- ---------------------------------------------------------------------
insert into crm_tags (org_id, name, description, color, category, label, active) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'VIP', 'Cliente de alto valor', '#F59E0B', 'estado', 'VIP', true),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Reclamação', 'Cliente com reclamação em aberto', '#DC2626', 'alerta', 'Reclamação', true),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Feedback Positivo', 'Deixou feedback positivo recentemente', '#16A34A', 'feedback', 'Feedback Positivo', true),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Recorrente', 'Compra com regularidade', '#2563EB', 'comportamento', 'Recorrente', true),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Novo Cliente', 'Registado nos últimos 30 dias', '#6B7280', 'estado', 'Novo Cliente', true),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'Aniversário Este Mês', 'Aniversário no mês corrente', '#8B5CF6', 'geral', 'Aniversário Este Mês', true);

-- ---------------------------------------------------------------------
-- crm_action_types
-- ---------------------------------------------------------------------
insert into crm_action_types (org_id, code, name, color, active, system) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CALL', 'Ligar', '#2563EB', true, false),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'WHATSAPP', 'Enviar WhatsApp', '#16A34A', true, false),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'EMAIL', 'Enviar Email', '#6B7280', true, false),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'BIRTHDAY', 'Aniversário', '#8B5CF6', true, true),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'FOLLOWUP', 'Follow-up Pós-Venda', '#F59E0B', true, false);

-- ---------------------------------------------------------------------
-- crm_scripts
-- ---------------------------------------------------------------------
insert into crm_scripts (org_id, code, name, segment, body, channel, trigger_timing, one_shot, cooldown_days, active) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'WELCOME01', 'Boas-vindas Novo Cliente', 'novo', 'Olá {{first_name}}, bem-vindo à Angrybox! 🍕', 'WhatsApp', 'on_signup', true, null, true),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'BDAY01', 'Aniversário', null, 'Parabéns {{first_name}}! Aqui está um desconto especial no teu dia 🎉', 'WhatsApp', 'on_birthday', false, 365, true),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'WINBACK01', 'Reconquista Cliente Inativo', 'inativo', 'Sentimos a tua falta, {{first_name}}! Volta com 10% de desconto.', 'Email', 'on_inactivity', false, 90, true),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'FEEDBACK01', 'Pedido de Feedback', null, 'Como foi a tua experiência, {{first_name}}?', 'WhatsApp', 'post_order', false, 30, true);

-- ---------------------------------------------------------------------
-- crm_parameters
-- ---------------------------------------------------------------------
insert into crm_parameters (org_id, key, value, description, category) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'default_currency', 'EUR', 'Moeda usada nos relatórios de CRM', 'geral'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'loyalty_points_per_euro', '1', 'Pontos de fidelização atribuídos por euro gasto', 'fidelizacao'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'inactivity_days_threshold', '60', 'Dias sem compra para considerar cliente inativo', 'segmentacao'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'default_discount_pct', '10', 'Desconto padrão em campanhas de reconquista', 'marketing');

-- ---------------------------------------------------------------------
-- crm_customers (id is text, no default -- ids assigned here)
-- ---------------------------------------------------------------------
insert into crm_customers (
  org_id, id, first_name, last_name, email, phone, preferred_channel, birthday,
  how_found, opt_in, notes, inactive, registered_at
) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0001', 'Marta', 'Oliveira Silva', 'marta.oliveira@example.com', '+351912000001', 'WhatsApp', '1990-05-14', 'Redes Sociais', 'Sim', null, false, current_date - 200),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0002', 'João', 'Pedro Almeida', 'joao.almeida@example.com', '+351912000002', 'WhatsApp', '1985-11-02', 'Walk-in', 'Pendente', null, false, current_date - 150),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0003', 'Beatriz', 'Sousa Martins', 'beatriz.martins@example.com', '+351912000003', 'Email', '1993-07-22', 'Indicação', 'Sim', 'Indicada pela Marta', false, current_date - 90),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0004', 'Ricardo', 'Manuel Teixeira', 'ricardo.teixeira@example.com', '+351912000004', 'SMS', '1979-02-28', 'Passagem', 'Não', 'Não voltou desde a primeira visita', true, current_date - 400),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0005', 'Sara', 'Isabel Cardoso', 'sara.cardoso@example.com', '+351912000005', 'WhatsApp', '2000-09-09', 'Outro', 'Sim', null, false, current_date - 60),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0006', 'Miguel', 'Ângelo Ferreira', 'miguel.ferreira@example.com', '+351912000006', 'WhatsApp', '1996-12-19', 'Redes Sociais', 'Pendente', null, false, current_date - 30),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0007', 'Inês', 'Raquel Gonçalves', 'ines.goncalves@example.com', '+351912000007', 'Email', '1988-03-11', 'Indicação', 'Sim', 'Indicada pela Beatriz', false, current_date - 20),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0008', 'Tiago', 'Filipe Rodrigues', 'tiago.rodrigues@example.com', '+351912000008', 'WhatsApp', '1997-06-25', 'Walk-in', 'Sim', null, false, current_date - 5);

update crm_customers set referred_by = 'CUST0001' where id = 'CUST0003';
update crm_customers set referred_by = 'CUST0003' where id = 'CUST0007';

-- ---------------------------------------------------------------------
-- crm_customer_tags
-- ---------------------------------------------------------------------
insert into crm_customer_tags (org_id, customer_id, tag_name) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0001', 'VIP'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0001', 'Recorrente'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0003', 'Recorrente'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0004', 'Reclamação'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0006', 'Novo Cliente'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0008', 'Novo Cliente'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0005', 'Feedback Positivo');

-- ---------------------------------------------------------------------
-- crm_contacts
-- ---------------------------------------------------------------------
insert into crm_contacts (org_id, customer_id, contacted_at, channel, script_code, direction, status, response, notes, segment_at_time) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0001', now() - interval '30 days', 'WhatsApp', 'WELCOME01', 'Enviado', 'Lido', 'Positivo', null, 'novo'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0003', now() - interval '10 days', 'WhatsApp', 'FEEDBACK01', 'Enviado', 'Respondeu', 'Positivo', 'Elogiou o tempo de entrega', 'recorrente'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0004', now() - interval '5 days', 'Email', 'WINBACK01', 'Enviado', 'Não Respondeu', 'Sem Resposta', null, 'inativo'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0006', now() - interval '2 days', 'WhatsApp', 'WELCOME01', 'Enviado', 'Entregue', null, null, 'novo'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0005', now() - interval '1 days', 'WhatsApp', null, 'Recebido', null, 'Positivo', 'Perguntou sobre pizzas vegetarianas', 'ativo');

-- ---------------------------------------------------------------------
-- crm_customer_actions
-- ---------------------------------------------------------------------
insert into crm_customer_actions (org_id, customer_id, action_type_code, status, scheduled_for, completed_at, notes, script_code) values
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0004', 'CALL', 'pending', now() + interval '1 day', null, 'Ligar para perceber motivo da reclamação', null),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0002', 'FOLLOWUP', 'pending', now() + interval '2 days', null, null, 'FEEDBACK01'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0001', 'BIRTHDAY', 'completed', now() - interval '20 days', now() - interval '20 days', 'Mensagem de aniversário enviada', 'BDAY01'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0006', 'WHATSAPP', 'completed', now() - interval '2 days', now() - interval '2 days', 'Boas-vindas enviadas', 'WELCOME01'),
  ('b6999cff-79b2-4583-b8b4-a744b3ace748', 'CUST0008', 'EMAIL', 'cancelled', now() - interval '3 days', null, 'Cliente pediu para não ser contactado', null);
