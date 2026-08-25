-- Local dev fixtures: financial base data (cost centers, suppliers, banks,
-- bank accounts). Synthetic data only -- no real supplier/bank information.
--
-- Ticket 02 (.scratch/org-location-foundation/issues/02-local-seed-fixtures.md).
-- No org_id/location_id columns exist on any table yet (that column pass is
-- ticket 06) -- these rows are inserted exactly as the tables exist today.

-- Org + location: intentionally not seeded here. Ticket 03's migration
-- inserts the one real Angrybox organization/location row directly (fixed
-- UUIDs); adding a second row here would violate its "exactly one
-- organization row" acceptance criterion, and no table below has an
-- org_id/location_id column to require one anyway.

-- ---------------------------------------------------------------------
-- cost_center_groups
-- ---------------------------------------------------------------------
insert into cost_center_groups (code, name, description, sort_order) values
  ('CMV', 'Custo de Mercadoria Vendida', 'Ingredientes, bebidas e embalagens consumidos na produção', 1),
  ('PESSOAL', 'Pessoal', 'Salários e encargos com a equipa', 2),
  ('OPEX', 'Despesas Operacionais', 'Renda, utilities e despesas gerais da loja', 3),
  ('MARKETING', 'Marketing', 'Publicidade e promoções', 4);

-- ---------------------------------------------------------------------
-- cost_center_categories
-- ---------------------------------------------------------------------
insert into cost_center_categories (
  group_id, code, name, financial_type, affects_dre, affects_cashflow,
  affects_profitability, requires_channel, description
) values
  ((select id from cost_center_groups where code = 'CMV'), 'CMV_INGREDIENTES', 'Ingredientes', 'variable', true, true, true, false, 'Matérias-primas para produção'),
  ((select id from cost_center_groups where code = 'CMV'), 'CMV_EMBALAGENS', 'Embalagens', 'variable', true, true, true, false, 'Caixas, sacos e descartáveis'),
  ((select id from cost_center_groups where code = 'PESSOAL'), 'PESSOAL_SALARIOS', 'Salários', 'fixed', true, true, false, false, 'Remunerações base da equipa'),
  ((select id from cost_center_groups where code = 'PESSOAL'), 'PESSOAL_ENCARGOS', 'Encargos Sociais', 'fixed', true, true, false, false, 'Segurança social e seguros'),
  ((select id from cost_center_groups where code = 'OPEX'), 'OPEX_RENDA', 'Renda', 'fixed', true, true, false, false, 'Renda do espaço'),
  ((select id from cost_center_groups where code = 'OPEX'), 'OPEX_UTILITIES', 'Utilities', 'variable', true, true, false, false, 'Eletricidade, água e internet'),
  ((select id from cost_center_groups where code = 'MARKETING'), 'MKT_ADS', 'Publicidade', 'variable', true, true, false, true, 'Campanhas pagas por canal');

-- ---------------------------------------------------------------------
-- cost_centers
-- ---------------------------------------------------------------------
insert into cost_centers (code, name, category, subcategory, responsible_name, status) values
  ('CC-COZINHA', 'Cozinha', 'Produção', 'Preparação', 'Bruno Miguel Santos', 'active'),
  ('CC-SALA', 'Sala', 'Operações', 'Atendimento', 'Carla Sofia Pinto', 'active'),
  ('CC-DELIVERY', 'Delivery', 'Operações', 'Entregas', null, 'active'),
  ('CC-ADMIN', 'Administração', 'Administrativo', null, 'Ana Ferreira Costa', 'active'),
  ('CC-MKT', 'Marketing', 'Marketing', null, null, 'active');

-- ---------------------------------------------------------------------
-- suppliers (invented companies, invented NIFs/IBANs)
-- ---------------------------------------------------------------------
insert into suppliers (
  name, nif, email, phone, address, iban, payment_terms_days, notes, status,
  default_cost_center_group_id, default_cost_center_category_id, default_financial_type
) values
  ('Quinta do Sabor Distribuição, Lda', '509123456', 'geral@quintadosabor.example', '+351220123456',
   'Rua das Hortas 12, 4400-000 Vila Nova de Gaia', 'PT50000201231234567890144', 30,
   'Fornecedor principal de ingredientes frescos', 'active',
   (select id from cost_center_groups where code = 'CMV'),
   (select id from cost_center_categories where code = 'CMV_INGREDIENTES'), 'variable'),
  ('Embalagens Norte, Lda', '509234567', 'vendas@embalagensnorte.example', '+351229876543',
   'Zona Industrial 4, 4470-000 Maia', 'PT50003512341234567890177', 45, null, 'active',
   (select id from cost_center_groups where code = 'CMV'),
   (select id from cost_center_categories where code = 'CMV_EMBALAGENS'), 'variable'),
  ('Energia Lisboa, SA', '509345678', 'apoio.cliente@energialisboa.example', '+351210111222',
   'Avenida da Liberdade 100, 1250-000 Lisboa', 'PT50007812341234567890200', 15,
   'Fatura mensal de eletricidade', 'active',
   (select id from cost_center_groups where code = 'OPEX'),
   (select id from cost_center_categories where code = 'OPEX_UTILITIES'), 'variable'),
  ('Publicidade Criativa, Lda', '509456789', 'contacto@publicidadecriativa.example', '+351937654321',
   'Rua do Comércio 8, 4000-000 Porto', 'PT50001812341234567890233', 30, null, 'active',
   (select id from cost_center_groups where code = 'MARKETING'),
   (select id from cost_center_categories where code = 'MKT_ADS'), 'variable'),
  ('Limpezas Rápidas Unipessoal, Lda', '509567890', 'geral@limpezasrapidas.example', '+351913456789',
   'Rua Nova 3, 4410-000 Vila Nova de Gaia', 'PT50002312341234567890266', 30, null, 'inactive',
   null, null, null);

-- ---------------------------------------------------------------------
-- banks
-- ---------------------------------------------------------------------
insert into banks (name, logo_key, color, country, bic, statement_format) values
  ('Banco Fictício Um', 'banco-ficticio-um', '#1E3A8A', 'PT', 'BFUMPTP1XXX', 'csv_generic'),
  ('Banco Fictício Dois', 'banco-ficticio-dois', '#B91C1C', 'PT', 'BFDOISPTP1X', 'xlsx_generic'),
  ('Caixa Exemplo', 'caixa-exemplo', '#065F46', 'PT', 'CEXPTP1XXX', 'csv_generic');

-- ---------------------------------------------------------------------
-- bank_accounts
-- ---------------------------------------------------------------------
insert into bank_accounts (bank_id, type, nickname, iban, account_number, account_type, is_active) values
  ((select id from banks where name = 'Banco Fictício Um'), 'account', 'Conta Ordenado Loja',
   'PT50000201231234567890144', '00123456789', 'ordenado', true),
  ((select id from banks where name = 'Banco Fictício Um'), 'account', 'Conta Poupança',
   'PT50000201239876543210177', '00198765432', 'poupança', true),
  ((select id from banks where name = 'Banco Fictício Dois'), 'account', 'Conta Corrente Fornecedores',
   'PT50003512341122334455299', '00311223344', 'corrente', true);

insert into bank_accounts (bank_id, type, nickname, last_four_digits, card_name, credit_limit_cents, billing_cycle_day, is_active) values
  ((select id from banks where name = 'Caixa Exemplo'), 'credit_card', 'Cartão Despesas Loja',
   '4521', 'Angrybox Operações', 250000, 10, true);
