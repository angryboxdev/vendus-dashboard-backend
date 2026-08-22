-- Snapshot eatz de clientes exportado em 2026-08-15.
-- Gerado a partir de clientes_extraidos_ordenados (1).xlsx e do DB live em 2026-08-21.
-- 230 linhas XLSX; 59 novos clientes consolidados; IDs C231-C289.
-- C160 (Mário/raultest) foi colocado em quarentena e não é alterado.
-- Duplicados do DB não são apagados nem recebem o snapshot quando existe um registro canónico.

begin;

alter table public.crm_customers
  add column if not exists eatz_registered_at date,
  add column if not exists eatz_last_order_date date,
  add column if not exists eatz_order_count integer,
  add column if not exists eatz_total_spent numeric(12,2),
  add column if not exists eatz_avg_ticket numeric(12,2),
  add column if not exists eatz_segment text,
  add column if not exists eatz_marketing_opt_in boolean,
  add column if not exists eatz_snapshot_at date;

alter table public.crm_customers
  drop constraint if exists crm_customers_eatz_order_count_nonnegative,
  drop constraint if exists crm_customers_eatz_total_spent_nonnegative,
  drop constraint if exists crm_customers_eatz_avg_ticket_nonnegative,
  drop constraint if exists crm_customers_eatz_segment_valid;

alter table public.crm_customers
  add constraint crm_customers_eatz_order_count_nonnegative check (eatz_order_count is null or eatz_order_count >= 0),
  add constraint crm_customers_eatz_total_spent_nonnegative check (eatz_total_spent is null or eatz_total_spent >= 0),
  add constraint crm_customers_eatz_avg_ticket_nonnegative check (eatz_avg_ticket is null or eatz_avg_ticket >= 0),
  add constraint crm_customers_eatz_segment_valid check (eatz_segment is null or eatz_segment in ('Novo', 'Inativo', 'Recorrente'));

comment on column public.crm_customers.eatz_registered_at is 'Data de cadastro na plataforma eatz; não substitui registered_at do CRM.';
comment on column public.crm_customers.eatz_last_order_date is 'Data do último pedido no snapshot eatz.';
comment on column public.crm_customers.eatz_order_count is 'Quantidade acumulada de pedidos no snapshot eatz.';
comment on column public.crm_customers.eatz_total_spent is 'Valor acumulado gasto no snapshot eatz.';
comment on column public.crm_customers.eatz_avg_ticket is 'Ticket médio informado pelo snapshot eatz.';
comment on column public.crm_customers.eatz_segment is 'Segmento informado pela eatz; não equivale ao campo inactive do CRM.';
comment on column public.crm_customers.eatz_marketing_opt_in is 'Consentimento de marketing informado pela eatz; não substitui opt_in do CRM.';
comment on column public.crm_customers.eatz_snapshot_at is 'Data de referência do snapshot eatz.';

do $$
begin
  if exists (
    select 1 from public.crm_customers
    where id in ('C231', 'C232', 'C233', 'C234', 'C235', 'C236', 'C237', 'C238', 'C239', 'C240', 'C241', 'C242', 'C243', 'C244', 'C245', 'C246', 'C247', 'C248', 'C249', 'C250', 'C251', 'C252', 'C253', 'C254', 'C255', 'C256', 'C257', 'C258', 'C259', 'C260', 'C261', 'C262', 'C263', 'C264', 'C265', 'C266', 'C267', 'C268', 'C269', 'C270', 'C271', 'C272', 'C273', 'C274', 'C275', 'C276', 'C277', 'C278', 'C279', 'C280', 'C281', 'C282', 'C283', 'C284', 'C285', 'C286', 'C287', 'C288', 'C289')
  ) then
    raise exception 'CRM import 084 abortado: um ou mais IDs C231-C289 já existem';
  end if;
end
$$;

-- O SQL Editor pode executar cada instrução em uma transação/sessão separada.
-- Por isso usamos uma staging table normal em vez de uma tabela temporária.
-- O DROP inicial torna a migration repetível após uma tentativa interrompida.
drop table if exists public.crm_eatz_import_084_stage;

create table public.crm_eatz_import_084_stage (
  target_id text primary key,
  is_new boolean not null,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  birthday date,
  eatz_registered_at date not null,
  eatz_last_order_date date,
  eatz_order_count integer not null,
  eatz_total_spent numeric(12,2) not null,
  eatz_avg_ticket numeric(12,2) not null,
  eatz_segment text not null,
  eatz_marketing_opt_in boolean not null,
  eatz_snapshot_at date not null
);

insert into public.crm_eatz_import_084_stage values
  ('C001', false, 'Taissa', 'Antonio', 'taissafilipa@gmail.com', '+351 910 099 638', null, '2026-05-11', '2026-05-18', 2, 48.48, 24.24, 'Inativo', true, '2026-08-15'),
  ('C002', false, 'Gabriela', 'Leitr', 'gabidpleite@yahoo.com.br', '+351 937 349 426', null, '2026-05-17', '2026-07-05', 3, 94.58, 31.53, 'Inativo', true, '2026-08-15'),
  ('C003', false, 'Ian', 'Macdonald', 'imac25@gmail.com', '+1 403 818 3394', null, '2026-05-14', '2026-05-14', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C004', false, 'Ivo', 'Moura', 'godeye@gmail.com', '+351913418256', null, '2026-05-14', '2026-05-14', 1, 23.62, 23.62, 'Inativo', true, '2026-08-15'),
  ('C005', false, 'Eduarda', 'Dias', 'duda.d@hotmail.com', '+351 910 932 534', null, '2026-05-06', '2026-05-06', 1, 35.17, 35.17, 'Inativo', true, '2026-08-15'),
  ('C006', false, 'Guilherme', 'Tavares', 'guilhermeptavares@gmail.com', '+351 913 456 132', null, '2026-05-16', '2026-05-16', 1, 53.37, 53.37, 'Inativo', true, '2026-08-15'),
  ('C007', false, 'Rui', 'Filipe Monteiro Oliveira', 'rui.oliveira1919@gmail.com', '+351933442081', null, '2026-05-18', '2026-05-18', 1, 22.01, 22.01, 'Inativo', true, '2026-08-15'),
  ('C008', false, 'Nuno', 'Macedo', 'nunomacedo2001@gmail.com', '+351 937 774 580', null, '2026-05-01', '2026-05-01', 1, 14.76, 14.76, 'Inativo', true, '2026-08-15'),
  ('C009', false, 'Fábio', 'Rodrigues', 'fmr7@live.com', '+351962735511', null, '2026-05-19', '2026-07-05', 2, 39.96, 19.98, 'Inativo', true, '2026-08-15'),
  ('C010', false, 'Jon', 'Grayson', 'jengrayson69@gmail.com', '+351918346618', '1969-10-18', '2026-05-12', '2026-07-18', 7, 194.46, 27.78, 'Inativo', true, '2026-08-15'),
  ('C011', false, 'Pedro', 'Filipe Alves Azevedo', 'pedro_nn85@hotmail.com', '+351 932 820 658', null, '2026-05-13', '2026-07-14', 3, 79.21, 26.40, 'Inativo', true, '2026-08-15'),
  ('C012', false, 'Mário', 'Teles', 'Idiotavista@hotmail.com', '+351938410002', null, '2026-05-18', '2026-06-05', 2, 47.75, 23.88, 'Inativo', true, '2026-08-15'),
  ('C013', false, 'Lucas', 'De Souza', 'lucashenriquedesouzall@gmail.com', '+351910163565', null, '2026-05-16', '2026-05-16', 1, 35.17, 35.17, 'Inativo', true, '2026-08-15'),
  ('C014', false, 'Ana', 'Nogueira', 'annee.nogueira@hotmail.com', '+351915604127', null, '2026-05-18', '2026-06-12', 2, 64.50, 32.25, 'Inativo', true, '2026-08-15'),
  ('C015', false, 'Alline', 'Bezerra Damato', 'alline_damato14@hotmail.com', '+351914052895', null, '2026-05-15', '2026-05-15', 1, 22.71, 22.71, 'Inativo', true, '2026-08-15'),
  ('C016', false, 'Gustavo', 'Martins', 'gustavosamartins26@gmail.com', '+351 961 221 563', null, '2026-05-17', '2026-06-10', 2, 51.06, 25.53, 'Inativo', true, '2026-08-15'),
  ('C017', false, 'Plynio', 'Maciel', 'plyniolp@hotmail.com', '+351 932 211 524', null, '2026-05-03', '2026-05-03', 1, 23.62, 23.62, 'Inativo', true, '2026-08-15'),
  ('C018', false, 'Rodolfo', 'Pereira', 'rodolfopereira.cct@gmail.com', '+351 916 435 256', null, '2026-05-17', '2026-05-17', 1, 23.62, 23.62, 'Inativo', true, '2026-08-15'),
  ('C019', false, 'ALEKSANDR', 'BUSHLANOV', 'bushlanov.alexander@gmail.com', '+351961952567', null, '2026-05-16', '2026-05-16', 1, 24.86, 24.86, 'Inativo', true, '2026-08-15'),
  ('C020', false, 'Danielle', 'Michard', 'danimichard@gmail.com', '+351 911 528 565', null, '2026-05-16', '2026-05-16', 1, 23.09, 23.09, 'Inativo', true, '2026-08-15'),
  ('C021', false, 'Raquel', 'Moreira', 'hongraon2022@hotmail.com', '+351937104591', null, '2026-05-12', '2026-05-12', 1, 35.17, 35.17, 'Inativo', true, '2026-08-15'),
  ('C022', false, 'Martim', 'Melo', 'martimcoelhomelo@gmail.com', '+351933275899', null, '2026-05-19', '2026-05-19', 1, 23.62, 23.62, 'Inativo', true, '2026-08-15'),
  ('C023', false, 'César', 'Igreja', 'miguel.igreja.99@gmail.com', '+351913243819', null, '2026-05-13', '2026-05-13', 1, 23.62, 23.62, 'Inativo', true, '2026-08-15'),
  ('C024', false, 'Bruno', 'Bessa', 'brunobomabessa15@gmail.com', '+351930641102', null, '2026-05-17', '2026-05-17', 1, 22.01, 22.01, 'Inativo', true, '2026-08-15'),
  ('C025', false, 'Gustavo', 'Ramos', 'gustavog4511@gmail.com', '+351 931 151 916', null, '2026-05-16', '2026-05-16', 1, 26.31, 26.31, 'Inativo', true, '2026-08-15'),
  ('C026', false, 'Paula', 'Ogata', 'ogata.mpaula@gmail.com', '+351 934 643 510', null, '2026-05-13', '2026-05-13', 1, 32.64, 32.64, 'Inativo', true, '2026-08-15'),
  ('C027', false, 'Monica', 'Rossini', 'nikarossini@gmail.com', '+351937912378', null, '2026-05-19', '2026-07-16', 2, 51.81, 25.91, 'Inativo', true, '2026-08-15'),
  ('C028', false, 'Suzana', 'Machado', 'suzanamachado@outlook.com', '+351 914 127 827', null, '2026-05-14', '2026-05-14', 1, 22.71, 22.71, 'Inativo', true, '2026-08-15'),
  ('C029', false, 'Jose', 'Guillen', 'joseluisleonguillen@gmail.com', '+351918302701', null, '2026-05-18', '2026-05-18', 1, 19.72, 19.72, 'Inativo', true, '2026-08-15'),
  ('C030', false, 'Rita', 'Cabral', 'ritabcabral@live.com.pt', '+351 913 122 423', null, '2026-05-10', '2026-05-10', 1, 23.62, 23.62, 'Inativo', true, '2026-08-15'),
  ('C031', false, 'Mafalda', 'Pinto', 'mafaldapinto03@gmail.com', '+351 919 072 569', null, '2026-05-14', '2026-05-14', 1, 22.71, 22.71, 'Inativo', true, '2026-08-15'),
  ('C032', false, 'Diana', 'Rocha', 'dianarodriguesrocha93@gmail.com', '+351910556525', null, '2026-05-01', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C034', false, 'Diogo', 'Duarte Pereira Faria', 'minionpotato17@gmail.com', '+351 911 585 877', null, '2026-05-17', '2026-05-17', 1, 23.62, 23.62, 'Inativo', true, '2026-08-15'),
  ('C035', false, 'Tiago', 'Machado', 'tiago.mebm.24.07@gmail.com', '+351917709273', null, '2026-05-09', '2026-05-09', 1, 23.62, 23.62, 'Inativo', true, '2026-08-15'),
  ('C036', false, 'Alessia', 'Romero', 'alessiasoarez@gmail.com', '+351916394218', null, '2026-05-20', '2026-05-20', 1, 18.11, 18.11, 'Inativo', true, '2026-08-15'),
  ('C037', false, 'Bruno', 'Lopes', 'lopesmcc@gmail.com', '+351936406555', null, '2026-05-21', '2026-05-21', 1, 33.56, 33.56, 'Inativo', true, '2026-08-15'),
  ('C038', false, 'Rodrigo', 'Moreira', 'rcmoreira8@gmail.com', '+351931917129', null, '2026-05-21', '2026-05-21', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C039', false, 'Nuno', 'Figueiredo', 'nuno.fig0601@gmail.com', '+351917340625', null, '2026-05-22', '2026-05-22', 1, 22.01, 22.01, 'Inativo', true, '2026-08-15'),
  ('C040', false, 'Mariana', 'Tenreiro', 'marianacfatenreiro@gmail.com', '+351918323219', '1989-02-13', '2026-05-22', '2026-05-22', 1, 22.01, 22.01, 'Inativo', true, '2026-08-15'),
  ('C041', false, 'Marcio', 'Fenelon dos Anjos', 'mfamarcio@gmail.com', '+351915664209', '1970-04-06', '2026-05-22', '2026-05-22', 1, 22.71, 22.71, 'Inativo', true, '2026-08-15'),
  ('C042', false, 'Fabiano', 'Borba', 'fabianolborba@gmail.com', '+351921391188', '1987-11-22', '2026-05-23', '2026-06-30', 2, 54.40, 27.20, 'Inativo', true, '2026-08-15'),
  ('C043', false, 'Carina', 'Mariani', 'carina.mariani@edu.ulisboa.pt', '+351969520167', null, '2026-05-23', '2026-06-02', 2, 39.43, 19.72, 'Inativo', true, '2026-08-15'),
  ('C044', false, 'Andreia', 'Brito', 'andreia.beatrizbrito@gmail.com', '+351963210737', null, '2026-05-23', '2026-05-23', 1, 29.60, 29.60, 'Inativo', true, '2026-08-15'),
  ('C045', false, 'Carlos', 'Chacin', 'carloschacin@gmail.com', '+351912843105', null, '2026-05-23', '2026-05-23', 1, 13.32, 13.32, 'Inativo', true, '2026-08-15'),
  ('C046', false, 'Rodrigo', 'Oliveira', 'rodrigofogm@gmail.com', '+351915633941', '1999-05-30', '2026-05-22', '2026-07-10', 5, 142.79, 28.56, 'Inativo', true, '2026-08-15'),
  ('C047', false, 'Francisco', 'Guerra', 'npein787@gmail.com', '+351935311717', null, '2026-05-24', '2026-05-24', 1, 16.99, 16.99, 'Inativo', true, '2026-08-15'),
  ('C048', false, 'Nicolas', 'Vici Garcia', 'applenino07@gmail.com', '+351938499256', '1999-07-07', '2026-05-24', '2026-05-24', 1, 34.12, 34.12, 'Inativo', true, '2026-08-15'),
  ('C049', false, 'Alvaro', 'Andrade', 'alvaro.andrad@hotmail.com', '+351918140456', '1996-10-15', '2026-05-24', '2026-05-24', 1, 24.32, 24.32, 'Inativo', true, '2026-08-15'),
  ('C050', false, 'Felipe', 'Santos', 'felipeafsantos@gmail.com', '+351914037973', '1981-11-03', '2026-05-24', '2026-05-24', 1, 30.81, 30.81, 'Inativo', true, '2026-08-15'),
  ('C051', false, 'Amanda', 'Balby', 'amandabalby@hotmail.com', '+351915857613', '1993-10-12', '2026-05-24', '2026-05-24', 1, 32.09, 32.09, 'Inativo', true, '2026-08-15'),
  ('C052', false, 'Matilde', 'Barrote', 'matildebarrote@gmail.com', '+351914118802', '1994-05-18', '2026-05-24', '2026-05-24', 1, 27.38, 27.38, 'Inativo', true, '2026-08-15'),
  ('C053', false, 'Andre', 'Pitarma', 'andrepitarma7@gmail.com', '+351915677065', '2006-11-24', '2026-05-24', '2026-05-24', 1, 22.01, 22.01, 'Inativo', true, '2026-08-15'),
  ('C054', false, 'margarida', 'cancela', 'mcancelasantos@icloud.com', '+351929124860', null, '2026-05-24', '2026-05-24', 1, 22.01, 22.01, 'Inativo', true, '2026-08-15'),
  ('C055', false, 'Tiago', 'Nunes', 'tiago.9.joao@gmail.com', '+351914103454', null, '2026-05-24', '2026-08-06', 2, 46.75, 23.38, 'Recorrente', true, '2026-08-15'),
  ('C056', false, 'Gabriel', 'Dantas', 'eldantas.rj@gmail.com', '+351932198563', '1990-11-08', '2026-05-25', '2026-05-25', 1, 16.11, 16.11, 'Inativo', true, '2026-08-15'),
  ('C058', false, 'Nuno', 'Goncalves', 'ng2000@hotmail.com', '+351962000907', null, '2026-05-23', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C059', false, 'Daniel', 'Paz', 'danipazb@gmail.com', '+351910738328', null, '2026-05-23', '2026-05-26', 1, 28.73, 28.73, 'Inativo', true, '2026-08-15'),
  ('C060', false, 'Alexandre', 'Cunha', 'alextcunha_7@hotmail.com', '+351913119675', null, '2026-05-24', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C061', false, 'Francisco', 'Almeida', 'chicationz@gmail.com', '+351919047448', null, '2026-05-23', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C062', false, 'Katia', 'Pires', 'katinhapersonaledf@gmail.com', '+351931055424', null, '2026-05-25', '2026-05-31', 1, 18.34, 18.34, 'Inativo', true, '2026-08-15'),
  ('C063', false, 'Raul', 'afonso', 'maricavalcantihh@gmail.com', '+351937824134', '1998-04-21', '2026-05-22', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C064', false, 'Vasco', 'da Encarnação', 'vgencarnacao@gmail.com', '+351916685666', '1972-02-10', '2026-05-24', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C065', false, 'Germana', 'Santos', 'germanysantos8@gmail.com', '+351936844407', '2001-01-17', '2026-05-25', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C066', false, 'Guilherme', 'Lemes', 'guilemess@hotmail.com', '+351930914359', '1994-04-22', '2026-05-25', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C067', false, 'Mafalda', 'Dias', 'mafaldapinheirodias@gmail.com', '+351932078377', '2005-06-02', '2026-05-24', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C068', false, 'Ana', 'Ribeiro', 'anaribeiro1998@outlook.pt', '+351914580024', '1998-04-14', '2026-05-22', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C069', false, 'Gabriel', 'Catel', 'gabrielcatelpsi@gmail.com', '+351933528874', '1993-08-07', '2026-05-23', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C070', false, 'Danilo', 'Molina', 'danilo2@eatz.pt', '+351965562655', '1987-07-03', '2026-05-22', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C073', false, 'Sónia', 'Gouveia', 'soniacgouveiav@gmail.com', '+351932749225', null, '2026-05-22', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C075', false, 'Shlomo', 'Dahan', 'shlomo.translations@gmail.com', '+351913489948', null, '2026-05-23', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C077', false, 'Inês', 'Morgado', 'seni.morgado@gmail.com', '+351910617170', '2001-02-24', '2026-05-26', '2026-05-26', 1, 17.45, 17.45, 'Inativo', true, '2026-08-15'),
  ('C078', false, 'Joana', 'Elisabete Borges Guimarães', 'joana.ebg@gmail.com', '+351910173446', '2000-10-30', '2026-05-26', '2026-05-26', 1, 85.24, 85.24, 'Inativo', true, '2026-08-15'),
  ('C080', false, 'Natan', 'de Barros', 'natan.barros@yahoo.com.br', '+351930914267', null, '2026-05-26', '2026-05-26', 1, 31.80, 31.80, 'Inativo', true, '2026-08-15'),
  ('C081', false, 'Tiago', 'Amorim', 'tiago.ac.amorim@gmail.com', '+351910760302', '1992-01-15', '2026-05-27', '2026-06-03', 2, 36.29, 18.15, 'Inativo', true, '2026-08-15'),
  ('C082', false, 'Nelson', 'Pereira', 'ngp.21.10.04@gmail.com', '+351919800305', '2004-10-21', '2026-05-28', '2026-05-28', 1, 25.40, 25.40, 'Inativo', true, '2026-08-15'),
  ('C083', false, 'Carolina', 'Sarmento', 'carolinarodiguessarmento@gmail.com', '+351916197768', null, '2026-05-28', '2026-05-28', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C084', false, 'Aurélia', 'Boccard', 'boccard.btscom13@gmail.com', '+351938655649', '1993-05-28', '2026-05-28', '2026-06-02', 2, 34.09, 17.05, 'Inativo', true, '2026-08-15'),
  ('C086', false, 'Carlos', 'Mendes', 'carlos22mendes22@gmail.com', '+351914631946', null, '2026-05-29', '2026-05-29', 1, 14.76, 14.76, 'Inativo', true, '2026-08-15'),
  ('C089', false, 'Inês', 'Reis', 'inesreis07@hotmail.com', '+351916893149', null, '2026-05-30', '2026-05-30', 1, 22.01, 22.01, 'Inativo', true, '2026-08-15'),
  ('C093', false, 'André', 'Gonçalves', 'andremgoncalves9@gmail.com', '+351963907161', null, '2026-06-01', '2026-06-01', 1, 25.76, 25.76, 'Inativo', true, '2026-08-15'),
  ('C094', false, 'Mariana', 'Castanheira', 'mariapostas@outlook.pt', '+351930561453', null, '2026-05-30', '2026-06-01', 1, 27.77, 27.77, 'Inativo', true, '2026-08-15'),
  ('C095', false, 'Rui', 'Pinto', 'rui.pinto16@gmail.com', '+351962120641', '1986-11-02', '2026-06-02', '2026-06-02', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C097', false, 'LuizFernando', 'Lima Costa', 'luizfernando_lc@hotmail.com', '+351927598398', '1988-08-17', '2026-05-23', '2026-06-03', 1, 25.54, 25.54, 'Inativo', true, '2026-08-15'),
  ('C098', false, 'André', 'Aragão', 'andreribeiroaragao@gmail.com', '+351919015487', null, '2026-06-04', '2026-06-04', 1, 27.50, 27.50, 'Inativo', true, '2026-08-15'),
  ('C101', false, 'Inês', 'Rodrigues', 'inesrodrigues807@gmail.com', '+351962049035', null, '2026-06-04', '2026-07-24', 2, 25.40, 12.70, 'Recorrente', true, '2026-08-15'),
  ('C102', false, 'Anissa', 'Fernandes', 'anissa.u.fernandes@gmail.com', '+351932321959', '1998-03-24', '2026-06-05', '2026-06-05', 1, 13.86, 13.86, 'Inativo', true, '2026-08-15'),
  ('C103', false, 'Alexandre', 'Adams Reis', 'alexandre.cagesp@gmail.com', '+351931354612', null, '2026-06-04', '2026-06-05', 1, 16.75, 16.75, 'Inativo', true, '2026-08-15'),
  ('C104', false, 'Nathalia', 'Oliveira Quadros', 'nathoq@icloud.com', '+351927694453', '1998-12-12', '2026-06-05', '2026-06-05', 1, 17.06, 17.06, 'Inativo', true, '2026-08-15'),
  ('C105', false, 'Diego', 'Canales', 'canales.diego12@gmail.com', '+351934202982', '1992-12-26', '2026-05-30', '2026-06-05', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C106', false, 'Rui', 'Marujo', 'ruimarujo_12@icloud.com', '+351937664059', null, '2026-06-05', '2026-06-05', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C107', false, 'karina', 'pedreira', 'karina.pedreira@gmail.com', '+351937740360', '1994-07-26', '2026-06-05', '2026-06-28', 2, 49.84, 24.92, 'Inativo', true, '2026-08-15'),
  ('C110', false, 'Joel', 'Teste', 'joelramalho17@gmail.com', '+351914282534', '2002-05-09', '2026-06-06', '2026-06-06', 1, 23.62, 23.62, 'Inativo', true, '2026-08-15'),
  ('C112', false, 'Maria', 'Vieira', 'mgcv06@gmail.com', '+351962513593', '2004-02-04', '2026-06-06', '2026-06-06', 1, 26.04, 26.04, 'Inativo', true, '2026-08-15'),
  ('C113', false, 'Flábio', 'Filho', 'flabiofilho@gmail.com', '+351912961105', '1994-09-28', '2026-06-07', '2026-06-07', 1, 29.26, 29.26, 'Inativo', true, '2026-08-15'),
  ('C114', false, 'Nelson', 'Oliveira', 'simoesoliveira8@gmail.com', '+351922261063', '1998-07-18', '2026-06-07', '2026-06-07', 1, 27.65, 27.65, 'Inativo', true, '2026-08-15'),
  ('C115', false, 'Helder', 'Teves', 'helderdeteves@gmail.com', '+351934214040', '2003-07-08', '2026-06-09', '2026-06-09', 1, 28.53, 28.53, 'Inativo', true, '2026-08-15'),
  ('C116', false, 'DAVID', 'RIBEIRO MORLA', 'drm-999@hotmail.com', '+351929190024', '1999-12-03', '2026-06-09', '2026-06-09', 1, 22.71, 22.71, 'Inativo', true, '2026-08-15'),
  ('C118', false, 'Simon', 'Bromberg', 'turfmansimon@gmail.com', '+351963675283', '1976-11-01', '2026-06-11', '2026-06-11', 1, 52.18, 52.18, 'Inativo', true, '2026-08-15'),
  ('C119', false, 'Bruno', 'Pereira', 'brunodaniel1994@hotmail.com', '+351915131903', '1994-09-28', '2026-06-11', '2026-06-11', 1, 20.71, 20.71, 'Inativo', true, '2026-08-15'),
  ('C120', false, 'Alessandra', 'Sousa', 'alessandra.francezp@gmail.com', '+351915980435', null, '2026-06-13', '2026-06-13', 1, 55.34, 55.34, 'Inativo', true, '2026-08-15'),
  ('C122', false, 'Renata', 'Martins', 'rennata.fmartins@gmail.com', '+351936772044', '1991-01-29', '2026-06-13', '2026-06-13', 1, 27.01, 27.01, 'Inativo', true, '2026-08-15'),
  ('C123', false, 'Moisés', 'Santos', 'moisesOrocha@gmail.com', '+351913473915', null, '2026-06-03', '2026-08-08', 5, 177.25, 35.45, 'Recorrente', true, '2026-08-15'),
  ('C126', false, 'Romy', 'Gouveia', 'romikita@gmail.com', '+351910895257', '1990-05-06', '2026-06-14', '2026-06-14', 1, 62.71, 62.71, 'Inativo', true, '2026-08-15'),
  ('C127', false, 'Vitor', 'Almeida', 'hello@vitoralmeida.me', '+351913639040', '1994-06-22', '2026-06-15', '2026-06-15', 1, 25.79, 25.79, 'Inativo', true, '2026-08-15'),
  ('C128', false, 'Rafaela', 'Bara', 'rafarafabara@gmail.com', '+351932608390', null, '2026-06-17', '2026-06-17', 1, 16.14, 16.14, 'Inativo', true, '2026-08-15'),
  ('C130', false, 'Beatriz', 'Magalhães', 'beatrizmctmuni@gmail.com', '+351932576190', '2004-05-01', '2026-06-19', '2026-06-19', 1, 28.38, 28.38, 'Inativo', true, '2026-08-15'),
  ('C131', false, 'Leonardo', 'Pereira', 'pereiraleonardo212@gmail.com', '+351910751815', '2000-08-07', '2026-06-22', '2026-06-22', 1, 33.40, 33.40, 'Inativo', true, '2026-08-15'),
  ('C133', false, 'Alexandre', 'Lobo', 'alexlobinho25@gmail.com', '+351910835266', '1999-06-25', '2026-06-24', '2026-06-24', 1, 14.76, 14.76, 'Inativo', true, '2026-08-15'),
  ('C136', false, 'Luiza', 'Candeco', 'filho_temp@outlook.pt', '+351934970069', null, '2026-06-26', '2026-06-26', 1, 29.10, 29.10, 'Inativo', true, '2026-08-15'),
  ('C137', false, 'Saed', 'Penaloza', 'saedcanro@gmail.com', '+351928256620', '2001-10-26', '2026-06-28', '2026-06-28', 1, 17.46, 17.46, 'Inativo', true, '2026-08-15'),
  ('C140', false, 'João', 'Santos', 'jmmps12@gmail.com', '+351913941999', null, '2026-06-29', '2026-08-09', 2, 55.27, 27.63, 'Recorrente', true, '2026-08-15'),
  ('C144', false, 'Anna', 'Urzedo', 'anna.urzedo@gmail.com', '+351932732025', null, '2026-07-01', '2026-07-01', 1, 26.47, 26.47, 'Inativo', true, '2026-08-15'),
  ('C145', false, 'Daniel', 'Santos', 'daniel03060202@gmail.com', '+351917645214', null, '2026-07-01', '2026-07-01', 1, 59.53, 59.53, 'Inativo', true, '2026-08-15'),
  ('C147', false, 'Geraldo', 'Nogueira', 'geralnog@gmail.com', '+351912372863', null, '2026-07-02', '2026-07-23', 2, 75.81, 37.91, 'Recorrente', true, '2026-08-15'),
  ('C148', false, 'Francisco', 'Ponces', 'franciscoponces@gmail.com', '+351919792135', '2001-05-25', '2026-07-02', '2026-07-02', 1, 38.08, 38.08, 'Inativo', true, '2026-08-15'),
  ('C149', false, 'Miguel', 'Neri', 'miguelneri2002@gmail.com', '+351961607676', null, '2026-07-02', '2026-07-02', 1, 17.39, 17.39, 'Inativo', true, '2026-08-15'),
  ('C152', false, 'Kyle', 'Fischer', 'kfischer005@gmail.com', '+351963568027', '1997-06-24', '2026-06-27', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C153', false, 'goncalo', 'monteiro', 'gorafa2003@gmail.com', '+351939053949', null, '2026-06-13', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C154', false, 'Ana', 'Fernandes', 'alsf1999@gmail.com', '+351917798204', null, '2026-05-31', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C155', false, 'Diogo', 'Teles', 'telesdiogo17@gmail.com', '+351935749660', null, '2026-07-03', '2026-07-03', 1, 30.58, 30.58, 'Inativo', true, '2026-08-15'),
  ('C156', false, 'Dinis', 'Almeida', 'dinissalazar77@gmail.com', '+351915394862', null, '2026-06-21', '2026-07-03', 1, 29.68, 29.68, 'Inativo', true, '2026-08-15'),
  ('C157', false, 'Nuno', 'Sá', 'nunofsa@msn.com', '+351916252877', null, '2026-07-03', '2026-07-03', 1, 17.60, 17.60, 'Inativo', true, '2026-08-15'),
  ('C159', false, 'Carm', 'Carm', 'carm@carm.com', '+351937937666', '2000-06-30', '2026-06-30', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C161', false, 'Natalie', 'castellano', 'nataliecastellano34@gmail.com', '+351962967520', null, '2026-05-27', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C164', false, 'André', 'Pereira', 'greyowl@netcabo.pt', '+351918855274', null, '2026-06-29', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C165', false, 'Filipe', 'Lima', 'filipelima1990@gmail.com', '+351910136251', null, '2026-06-28', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C167', false, 'Anne', 'Leite', 'annerleite@gmail.com', '+351912031915', '1993-08-31', '2026-06-28', '2026-08-02', 1, 45.24, 45.24, 'Recorrente', true, '2026-08-15'),
  ('C168', false, 'Paula', 'Azevedo', 'azevedogpaula@gmail.com', '+351910245883', '1991-02-20', '2026-06-28', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C170', false, 'Artur', 'Cardoso', 'arturcardoso12@hotmail.com', '+351917324722', '1995-09-15', '2026-06-28', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C172', false, 'Núria', 'Campos', 'nuria.solange@gmail.com', '+351916940128', '2002-02-08', '2026-06-09', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C174', false, 'Pedro Henrique', 'de Freitas Souza', 'pedrohsouza33@gmail.com', '+351933200496', '2001-01-09', '2026-05-26', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C175', false, 'Matilde', 'Alves', 'amatilde2006@gmail.com', '+351919429080', '2006-07-20', '2026-07-04', '2026-07-04', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C178', false, 'Sarami', 'Carolina Penaloza', 'saramip.1007@gmail.com', '+351939176133', '1980-10-07', '2026-07-04', '2026-07-04', 1, 17.89, 17.89, 'Inativo', true, '2026-08-15'),
  ('C180', false, 'Marco', 'Ribeiro', 'marcorib@gmail.com', '+351914825487', '1974-12-03', '2026-07-05', '2026-07-05', 1, 22.01, 22.01, 'Inativo', true, '2026-08-15'),
  ('C181', false, 'Augusto', 'Nascimento', 'augustonunes.dev@gmail.com', '+351910780298', null, '2026-07-05', '2026-07-05', 1, 60.45, 60.45, 'Inativo', true, '2026-08-15'),
  ('C186', false, 'Tiago', 'Filipe Correia do Amaral', 'tiagofcamaral@hotmail.com', '+351917173008', null, '2026-07-06', '2026-07-06', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C187', false, 'Maria', 'Matias', '2003jose.maria@gmail.com', '+351917086759', null, '2026-07-06', '2026-07-06', 1, 15.84, 15.84, 'Inativo', true, '2026-08-15'),
  ('C188', false, 'LEONID', 'BOLOTNIKOV', 'leonid.bolotnikov766@gmail.com', '+351922018224', null, '2026-07-08', '2026-07-08', 1, 17.03, 17.03, 'Inativo', true, '2026-08-15'),
  ('C189', false, 'Thais', 'Roberta Lopes da Silva', 'thaisroberta6277@gmail.com', '+351934581415', null, '2026-07-08', '2026-07-08', 1, 54.55, 54.55, 'Inativo', true, '2026-08-15'),
  ('C190', false, 'Gerson', '-', 'gveiga13@outlook.pt', '+351914566445', null, '2026-07-07', '2026-07-07', 1, 22.71, 22.71, 'Inativo', true, '2026-08-15'),
  ('C191', false, 'Ana', 'Batanete', 'martanjunqueira@gmail.com', '+351910217003', '1990-03-20', '2026-07-07', '2026-07-07', 1, 17.75, 17.75, 'Inativo', true, '2026-08-15'),
  ('C192', false, 'Carolina', 'Gomes', 'carolinaraquelmg@hotmail.com', '+351968871215', null, '2026-07-07', '2026-07-07', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C194', false, 'Daniela', 'Monteiro', 'danielamonteiro@hotmail.com', '+351917861303', '1984-09-07', '2026-07-08', '2026-08-08', 2, 98.21, 49.11, 'Recorrente', true, '2026-08-15'),
  ('C195', false, 'Maurício', 'Gomes', 'orspeeder@gmail.com', '+351913817589', '1987-12-22', '2026-07-09', '2026-07-11', 2, 64.13, 32.07, 'Inativo', true, '2026-08-15'),
  ('C200', false, 'Maria', 'Carlos Paredinha Pereira', 'mariacppereira2003@gmail.com', '+351927060716', '2003-05-05', '2026-07-10', '2026-07-10', 1, 17.45, 17.45, 'Inativo', true, '2026-08-15'),
  ('C201', false, 'Rui', 'Canedo', 'rmrcanedo@gmail.com', '+351913880832', null, '2026-07-10', '2026-07-10', 1, 19.17, 19.17, 'Inativo', true, '2026-08-15'),
  ('C203', false, 'THIAGO', 'VIEIRA', 'thiagovieirahc@gmail.com', '+351913445963', null, '2026-07-10', '2026-08-06', 2, 86.33, 43.17, 'Recorrente', true, '2026-08-15'),
  ('C204', false, 'Fletcher', 'Haverkamp', 'fletcherh@gmail.com', '+351911842471', null, '2026-07-10', '2026-07-10', 1, 31.01, 31.01, 'Inativo', true, '2026-08-15'),
  ('C207', false, 'Ana', 'Paula Parente', 'beatrizmaria.goncalves9@gmail.com', '+351914564750', null, '2026-07-11', '2026-07-11', 1, 33.56, 33.56, 'Inativo', true, '2026-08-15'),
  ('C208', false, 'Karoline', 'Botter', 'karolinebotter@icloud.com', '+351932330400', '1993-04-26', '2026-07-11', '2026-07-11', 1, 32.25, 32.25, 'Inativo', true, '2026-08-15'),
  ('C209', false, 'Carolina', 'Romano', 'carolinaromanodias@gmail.com', '+351933203882', null, '2026-07-11', '2026-07-11', 1, 17.03, 17.03, 'Inativo', true, '2026-08-15'),
  ('C210', false, 'Luís', 'fernandes', 'luis.fezas@gmail.com', '+351918448283', null, '2026-07-11', '2026-07-11', 1, 19.85, 19.85, 'Inativo', true, '2026-08-15'),
  ('C211', false, 'Inês', 'Estrela', 'ines.f.estrela@hotmail.com', '+351917053904', '2000-04-18', '2026-07-12', '2026-07-12', 1, 19.17, 19.17, 'Inativo', true, '2026-08-15'),
  ('C212', false, 'Caio', 'Silva', 'caiogvbriel@gmail.com', '+351913632501', '2001-11-01', '2026-07-12', '2026-07-12', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C213', false, 'Rafael', 'Ferreira', 'rafah.26ferreira@hotmail.com', '+351933728299', null, '2026-07-12', '2026-07-12', 1, 40.84, 40.84, 'Inativo', true, '2026-08-15'),
  ('C214', false, 'Hugo', 'Veiga', 'hugohcveiga@gmail.com', '+351913219595', null, '2026-07-12', '2026-07-12', 1, 17.60, 17.60, 'Inativo', true, '2026-08-15'),
  ('C215', false, 'Francisco', 'Mangas', 'francisco.t.mangas@gmail.com', '+351916229067', '1994-03-04', '2026-05-23', '2026-07-12', 2, 33.71, 16.86, 'Inativo', true, '2026-08-15'),
  ('C216', false, 'Kristin', 'Canne', 'gingerafband@gmail.com', '+351910386255', null, '2026-07-12', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C218', false, 'Kacper', 'Cwel', 'rudybartek12@gmail.com', '+351937824702', null, '2026-07-13', '2026-07-13', 1, 24.86, 24.86, 'Inativo', true, '2026-08-15'),
  ('C219', false, 'Fábio', 'Miguel Nascimento', 'fnascimento567@outlook.com', '+351913312551', null, '2026-07-13', '2026-07-13', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C220', false, 'Sérgio', 'Soares', 'anacatarinafsoares@gmail.com', '+351919128165', '1975-09-14', '2026-07-14', '2026-07-14', 1, 30, 30, 'Inativo', true, '2026-08-15'),
  ('C221', false, 'Laís', 'Silva', 'cllais.silva@gmail.com', '+351910389464', '1999-07-14', '2026-07-14', '2026-07-14', 1, 22.87, 22.87, 'Inativo', true, '2026-08-15'),
  ('C225', false, 'Vladyslav', 'Vernyhora', 'vernugora56@gmail.com', '+351920802041', null, '2026-07-17', '2026-07-17', 1, 27.32, 27.32, 'Inativo', true, '2026-08-15'),
  ('C229', false, 'Diogo', 'Pereira', 'diogo.mgomes.pereira@gmail.com', '+351925028144', null, '2026-07-19', '2026-07-19', 1, 21.20, 21.20, 'Inativo', true, '2026-08-15'),
  ('C230', false, 'Luis', 'Torres', 'luistorresjr2013@yahoo.com', '+351963568125', null, '2026-06-27', '2026-07-20', 2, 92.01, 46.01, 'Recorrente', true, '2026-08-15'),
  ('C231', true, 'aria', 'hall', 'aria2.hall2@gmail.com', '+351962967524', null, '2026-05-27', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C232', true, 'Juliana', 'Rezende', 'juliana_rezende@msn.com', '+351932801576', null, '2026-05-28', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C233', true, 'Thamyres', 'Vasconcellos', 'thamyres@live.com', '+351933101413', '1990-08-06', '2026-05-28', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C234', true, 'Ysabel', 'Lopes', 'ysabellopes@gmail.com', '+351912687931', '1992-04-24', '2026-05-28', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C235', true, 'Ana Carolina', 'Ferreira', 'anacarolina_ferr@hotmail.com', '+351963571563', '1999-06-05', '2026-05-29', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C236', true, 'Alexandra', 'Costelha', 'alexandracostelha@hotmail.com', '+351918656128', '1999-10-23', '2026-05-29', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C237', true, 'Cecília', 'Cruz', 'ceciliad.cruz@hotmail.com', '+351914955455', null, '2026-05-29', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C238', true, 'Rafael', 'Filipe', 'rafaporto406@gmail.com', '+351915432197', null, '2026-05-29', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C239', true, 'Bruna', 'Taveira', 'btctaveira@gmail.com', '+351933079696', '1998-05-10', '2026-05-31', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C240', true, 'Marcelo', 'Inacio Jeske', 'marcelojeske04@gmail.com', '+351967897555', '1996-02-01', '2026-06-01', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C241', true, 'pierre', 'bagnola', 'pierrelvetschenko@gmail.com', '+351912002584', '1996-04-23', '2026-06-02', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C242', true, 'João', 'Loureiro', 'loureiro.joao@outlook.com', '+351910204770', null, '2026-06-02', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C243', true, 'Francisco', 'Amaro', 'francisco.amaro.98@gmail.com', '+351916879910', null, '2026-06-04', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C244', true, 'Rodrigo', 'Oliveira', 'rodrigo.ferraotech@gmail.com', '+351913603136', null, '2026-06-05', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C245', true, 'Licia', 'Boaventura', 'licia.boaventuraadv@gmail.com', '+351936997548', '1981-10-16', '2026-06-06', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C246', true, 'João', 'Teles', 'j.teles2002@gmail.com', '+351934411477', '2002-12-18', '2026-06-06', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C247', true, 'Renata', 'Fernandes', 'natapipa2@gmail.com', '+351914618753', '2001-08-16', '2026-06-07', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C248', true, 'Daniel', 'Magalhães', 'daniellmagalhaes@hotmail.com', '+351917112264', null, '2026-06-07', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C249', true, 'Patrícia', 'Pereira', 'lpatriciacpereira@gmail.com', '+351932813598', '1986-10-08', '2026-06-08', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C250', true, 'leonor', 'vila maior', 'leonorvilamaior04@gmail.com', '+351915170964', '2004-10-16', '2026-06-08', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C251', true, 'Vasco', 'costa', 'vascotkosta@gmail.com', '+351964045588', null, '2026-06-09', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C252', true, 'Ellie', 'Burke', 'ellieburke24@outlook.com', '+351915245709', '1997-07-24', '2026-06-09', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C253', true, 'Thalita', 'Scarpa', 'thaliscarpa@gmail.com', '+351910657005', '1998-11-04', '2026-06-10', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C254', true, 'Joana', 'Costa', 'joana.diz@hotmail.com', '+351916684768', '1996-11-26', '2026-06-10', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C255', true, 'Ana', 'Carvalho', 'anaferreiracarvalho9@gmail.com', '+351913993439', '1990-09-09', '2026-06-12', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C256', true, 'Sara', 'Duarte', 'sara.e.c.duarte@gmail.com', '+351913667993', '2000-06-29', '2026-06-16', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C257', true, 'Theo', 'Brozinga', 'theobrozinga@gmail.com', '+351924226833', null, '2026-06-16', '2026-08-08', 1, 23.95, 23.95, 'Recorrente', true, '2026-08-15'),
  ('C258', true, 'Hernan', 'Ortega', 'facuortega35@gmail.com', '+351927512945', '1996-04-30', '2026-06-16', '2026-06-16', 1, 23.62, 23.62, 'Inativo', true, '2026-08-15'),
  ('C259', true, 'Karolyne', 'Costa', 'karolyne.ksgc@gmail.com', '+351915377246', null, '2026-06-16', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C260', true, 'mayra reis dos santos', 'reis', 'mayrareisdossantos@icloud.com', '+351911170263', null, '2026-06-17', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C261', true, 'josé', 'rodrigues', 'zezaoazvd@gmail.com', '+351935790223', null, '2026-06-18', '2026-06-18', 1, 12.08, 12.08, 'Inativo', true, '2026-08-15'),
  ('C262', true, 'Matilde', 'Duarte', 'matilde.dar@gmail.com', '+351912115567', '2002-12-31', '2026-06-21', '2026-06-21', 1, 15.44, 15.44, 'Inativo', true, '2026-08-15'),
  ('C263', true, 'Pedro', 'Picado', 'pedrog_622@hotmail.com', '+351928126055', '1976-06-29', '2026-07-02', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C264', true, 'Junior', 'Silveira', 'ricardo.junior.business@gmail.com', '+351935684335', '1985-11-12', '2026-07-05', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C265', true, 'Michal', 'Nowak', 'fajnybanan@gmail.com', '+351911222333', null, '2026-07-06', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C266', true, 'David', 'Sousa', 'davidmfdsousa@gmail.com', '+351912760772', '1988-12-07', '2026-07-19', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C267', true, 'Pedro', 'Ano Bom', 'pedrovictorfab@hotmail.com', '+351912380455', '1999-10-28', '2026-07-21', '2026-07-21', 1, 32.15, 32.15, 'Novo', true, '2026-08-15'),
  ('C268', true, 'Pedro', 'Ed', 'pedro_ec@msn.com', '+351924751684', '1997-11-22', '2026-07-22', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C269', true, 'joão', 'paulo castro', 'joaocastrosec@gmail.com', '+351936787049', '2005-09-13', '2026-07-23', '2026-07-23', 1, 26.09, 26.09, 'Novo', true, '2026-08-15'),
  ('C270', true, 'Fausto', null, 'faustoervasfabbrifilho@gmail.com', '+351965117084', null, '2026-07-23', '2026-07-23', 1, 12.08, 12.08, 'Novo', true, '2026-08-15'),
  ('C271', true, 'Mathilde', 'Castro', 'mathildecastro52@gmail.com', '+351933673324', null, '2026-07-24', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C272', true, 'Omar', 'Ajoue', 'krynble@gmail.com', '+351911169027', '1986-06-13', '2026-07-25', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C273', true, 'Paulo', 'Simões', 'paulosimoes1989@gmail.com', '+351918918214', '1989-02-02', '2026-07-25', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C274', true, 'Raphael', 'Moragas', 'raphael6384@gmail.com', '+351962401031', '1991-06-26', '2026-07-26', '2026-07-26', 1, 30.33, 30.33, 'Novo', true, '2026-08-15'),
  ('C275', true, 'Ingride', 'Gama', 'ingridegama2@gmail.com', '+351912642227', '1997-10-22', '2026-07-28', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C276', true, 'Maria', 'sousa', 'amariaj.sousa98@gmail.com', '+9157430313', '1998-08-01', '2026-07-28', '2026-07-28', 1, 52.30, 52.30, 'Novo', true, '2026-08-15'),
  ('C277', true, 'Mariana', 'Dlppolito', 'maridippolito2003@gmail.com', '+351938557125', '2003-08-16', '2026-08-01', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C278', true, 'João', 'D’Ippolito', 'joaovdippolito@gmail.com', '+351910250002', null, '2026-08-02', '2026-08-02', 1, 75.86, 75.86, 'Novo', true, '2026-08-15'),
  ('C279', true, 'Fabrício', 'Callegaro Corrêa Kader', 'fabriciockader@gmail.com', '+351920527395', '1995-08-04', '2026-08-04', '2026-08-05', 2, 98.36, 49.18, 'Recorrente', true, '2026-08-15'),
  ('C280', true, 'Jennifer', 'Grayson', 'jengraysonProto@proton.me', '+351926988525', '1969-10-18', '2026-08-05', '2026-08-05', 1, 30.28, 30.28, 'Novo', true, '2026-08-15'),
  ('C281', true, 'Reynold', 'Oramas', 'reynoldalejandro46@gmail.com', '+351930554878', null, '2026-08-06', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C282', true, 'Gabriel', 'Gomes', 'bernardo.cf.389@gmail.com', '+351938423017', '1996-06-20', '2026-08-06', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C283', true, 'Gustavo', 'Barbosa', 'gustavobarbosa2001@gmail.com', '+351918857655', '2001-09-09', '2026-08-08', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C284', true, 'Marta', 'Martins', 'martinha.mp.21@gmail.com', '+351911954820', null, '2026-08-10', '2026-08-10', 1, 26.09, 26.09, 'Novo', true, '2026-08-15'),
  ('C285', true, 'Ana', 'Castro', 'anacastro31012002@gmail.com', '+351918166998', null, '2026-08-10', '2026-08-10', 1, 38.87, 38.87, 'Novo', true, '2026-08-15'),
  ('C286', true, 'Daniel', 'Nogueira', 'nogueiradaniel47@gmail.com', '+351918424471', '2004-07-20', '2026-08-11', null, 0, 0, 0, 'Inativo', true, '2026-08-15'),
  ('C287', true, 'judith', 'k berger', 'berger.judy@gmail.com', '+351910306728', null, '2026-08-13', '2026-08-13', 1, 36.72, 36.72, 'Novo', true, '2026-08-15'),
  ('C288', true, 'Eduardo', 'Duarte', 'eduarte94@gmail.com', '+351934165094', '1994-06-17', '2026-08-14', '2026-08-14', 1, 36.72, 36.72, 'Novo', true, '2026-08-15'),
  ('C289', true, 'Mary', 'K', 'marykinya54@gmail.com', '+351912730578', null, '2026-08-15', '2026-08-15', 1, 45.16, 45.16, 'Novo', true, '2026-08-15');

-- Atualiza apenas o registro canónico de cada correspondência.
-- Dados CRM existentes são preservados; email, telefone e aniversário só preenchem nulos.
update public.crm_customers as customer
set
  email = coalesce(customer.email, imported.email),
  phone = coalesce(customer.phone, imported.phone),
  birthday = coalesce(customer.birthday, imported.birthday),
  eatz_registered_at = imported.eatz_registered_at,
  eatz_last_order_date = imported.eatz_last_order_date,
  eatz_order_count = imported.eatz_order_count,
  eatz_total_spent = imported.eatz_total_spent,
  eatz_avg_ticket = imported.eatz_avg_ticket,
  eatz_segment = imported.eatz_segment,
  eatz_marketing_opt_in = imported.eatz_marketing_opt_in,
  eatz_snapshot_at = imported.eatz_snapshot_at,
  updated_at = now()
from public.crm_eatz_import_084_stage as imported
where customer.id = imported.target_id
  and imported.is_new = false;

-- Insere 59 pessoas novas, consolidadas por identidade e ordenadas por cadastro eatz.
insert into public.crm_customers (
  id, first_name, last_name, email, phone, preferred_channel, birthday, opt_in, registered_at,
  eatz_registered_at, eatz_last_order_date, eatz_order_count, eatz_total_spent,
  eatz_avg_ticket, eatz_segment, eatz_marketing_opt_in, eatz_snapshot_at
)
select
  target_id, first_name, last_name, email, phone, 'WhatsApp', birthday, 'Pendente', eatz_registered_at,
  eatz_registered_at, eatz_last_order_date, eatz_order_count, eatz_total_spent,
  eatz_avg_ticket, eatz_segment, eatz_marketing_opt_in, eatz_snapshot_at
from public.crm_eatz_import_084_stage
where is_new = true
order by target_id;

do $$
begin
  if (select count(*) from public.crm_eatz_import_084_stage where is_new) <> 59 then
    raise exception 'CRM import 084 inválido: eram esperados 59 novos clientes';
  end if;

  if exists (
    select 1
    from public.crm_eatz_import_084_stage as imported
    left join public.crm_customers as customer on customer.id = imported.target_id
    where customer.id is null
  ) then
    raise exception 'CRM import 084 incompleto: existem clientes do snapshot sem destino';
  end if;
end
$$;

drop table public.crm_eatz_import_084_stage;

commit;
