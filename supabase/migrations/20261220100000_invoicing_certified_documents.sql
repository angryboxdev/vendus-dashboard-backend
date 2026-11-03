-- Faturação certificada AT — módulo `invoicing`, F2 (.scratch/certificacao-at/).
-- Séries, documentos emitidos (assinados), linhas, resumo de impostos e
-- eventos. Regras impostas na própria BD (Portaria 363/2010 art. 3.º d);
-- Despacho 8632/2014 1.9, 1.11, 2.1, 3.3.7–3.3.8; DL 28/2019 arts. 7.º e 11.º):
--   * documentos, linhas e impostos só entram pela função de emissão;
--   * nada se apaga nem se trunca; documentos só mudam de estado
--     (N→A com motivo, CM N→F) e só pelas funções;
--   * o fim da cadeia da série só avança pela emissão (compare-and-swap);
--   * anon/authenticated/service_role não têm privilégios de escrita nos
--     registos fiscais — só as funções (security definer) escrevem.
-- A assinatura RSA é feita na aplicação (a chave privada nunca entra na BD);
-- quem altere dados assinados por fora é apanhado pela verificação da cadeia.
-- Fora desta migração (fases seguintes): recibos (Payments) e séries de
-- recuperação de documentos manuais (SourceBilling M).
-- Só cria objetos novos; rollback em docs/migrations/rollback/.

-- ── Tabelas ────────────────────────────────────────────────────────────────

create table if not exists public.invoicing_series (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  legal_entity_id uuid not null,
  location_id uuid,
  document_type text not null check (document_type in ('FT', 'FS', 'FR', 'NC', 'ND', 'CM')),
  series_id text not null check (
    length(series_id) between 1 and 35
    and series_id ~ '^[A-Za-z0-9]+([._-][A-Za-z0-9]+)*$'
    and upper(series_id) not like 'AT%'
  ),
  mode text not null check (mode in ('normal', 'training')),
  status text not null default 'active' check (status in ('active', 'finalized', 'cancelled')),
  validation_code text check (validation_code is null or (length(validation_code) >= 8 and validation_code !~ '[[:space:]*-]')),
  last_sequence integer not null default 0 check (last_sequence >= 0),
  last_hash text,
  last_document_date date,
  -- Instante (UTC) da última emissão: a cronologia valida-se por aqui, não pela hora
  -- local, que se repete na mudança de hora de outubro.
  last_system_entry_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint invoicing_series_org_id_uq unique (org_id, id),
  constraint invoicing_series_legal_entity_fk foreign key (org_id, legal_entity_id) references public.legal_entities (org_id, id),
  constraint invoicing_series_location_fk foreign key (org_id, location_id) references public.locations (org_id, id),
  constraint invoicing_series_chain_ck check ((last_sequence = 0) = (last_hash is null))
);
-- Único por emitente e tipo, sem distinguir maiúsculas (Manual de Séries §1.3.2).
create unique index if not exists invoicing_series_identifier_uq
  on public.invoicing_series (org_id, legal_entity_id, document_type, upper(series_id));

create table if not exists public.invoicing_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  series_ref uuid not null,
  legal_entity_id uuid not null,
  location_id uuid,
  document_type text not null,
  document_number text not null check (length(document_number) <= 60 and document_number ~ '^[^ ]+ [^/^ ]+/[0-9]+$'),
  sequence integer not null check (sequence >= 1),
  document_date date not null,
  tax_point_date date not null,
  -- SystemEntryDate assinado (hora legal de Lisboa, ao segundo) e o instante UTC correspondente.
  system_entry_date text not null check (system_entry_date ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'),
  system_entry_at timestamptz not null,
  -- SoftwareCertificateNumber à data de emissão ("0" enquanto o programa não está certificado).
  software_certificate_number text not null check (software_certificate_number ~ '^[0-9]{1,4}$'),
  source_billing text not null default 'P' check (source_billing in ('P', 'I', 'M')),
  hash text not null check (length(hash) = 172),
  hash_control text not null check (length(hash_control) between 1 and 70),
  key_version integer not null check (key_version >= 1),
  atcud text not null check (length(atcud) <= 100),
  qr_payload text not null,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  prices_include_tax boolean not null,
  net_total numeric(19, 2) not null check (net_total >= 0),
  tax_payable numeric(19, 2) not null check (tax_payable >= 0),
  gross_total numeric(19, 2) not null check (gross_total >= 0),
  -- Meio de pagamento (SAF-T PaymentMechanism) — faturas-recibo.
  payment_mechanism text check (payment_mechanism is null or payment_mechanism in
    ('CC', 'CD', 'CH', 'CI', 'CO', 'CS', 'DE', 'LC', 'MB', 'NU', 'OU', 'PR', 'TB', 'TR')),
  -- Cópias fiéis à data de emissão (2.ª via com os dados originais, Despacho 2.2.15).
  customer jsonb not null,
  issuer jsonb not null,
  -- NC/ND: documentos retificados [{document_id, document_number, reason}] (Despacho 1.4).
  references_to jsonb,
  -- Fatura de consultas de mesa: [{document_id, document_number}] (Despacho 1.3).
  order_references jsonb,
  status text not null default 'N' check (status in ('N', 'A', 'F')),
  status_reason text,
  -- Instante da mudança; no SAF-T sai em hora de Lisboa (InvoiceStatusDate).
  status_changed_at timestamptz,
  status_changed_by text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint invoicing_documents_org_id_uq unique (org_id, id),
  constraint invoicing_documents_series_sequence_uq unique (series_ref, sequence),
  constraint invoicing_documents_number_uq unique (org_id, legal_entity_id, document_number),
  constraint invoicing_documents_series_fk foreign key (org_id, series_ref) references public.invoicing_series (org_id, id),
  constraint invoicing_documents_legal_entity_fk foreign key (org_id, legal_entity_id) references public.legal_entities (org_id, id),
  constraint invoicing_documents_location_fk foreign key (org_id, location_id) references public.locations (org_id, id),
  constraint invoicing_documents_cancel_reason_ck check (status <> 'A' or length(btrim(coalesce(status_reason, ''))) > 0),
  constraint invoicing_documents_gross_ck check (gross_total = net_total + tax_payable)
);
create index if not exists invoicing_documents_org_date_idx on public.invoicing_documents (org_id, document_date desc);
create index if not exists invoicing_documents_entity_entry_idx on public.invoicing_documents (org_id, legal_entity_id, system_entry_at desc);

create table if not exists public.invoicing_document_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  document_id uuid not null,
  line_number integer not null check (line_number >= 1),
  -- SAF-T Line/Product: código, tipo (P produto, S serviço, O outros, E impostos especiais, I impostos) e unidade.
  product_code text not null check (length(btrim(product_code)) between 1 and 60),
  product_type text not null check (product_type in ('P', 'S', 'O', 'E', 'I')),
  unit_of_measure text not null check (length(btrim(unit_of_measure)) between 1 and 20),
  description text not null check (length(btrim(description)) between 1 and 200),
  quantity numeric(19, 6) not null check (quantity > 0),
  unit_price numeric(19, 6) not null check (unit_price >= 0),
  discount_pct numeric(7, 4) check (discount_pct is null or (discount_pct >= 0 and discount_pct <= 100)),
  line_amount numeric(19, 6) not null check (line_amount >= 0),
  tax_region text not null check (length(tax_region) between 2 and 5),
  tax_code text not null check (tax_code in ('RED', 'INT', 'NOR', 'ISE')),
  tax_percentage numeric(7, 4) not null check (tax_percentage >= 0),
  exemption_code text check (exemption_code is null or exemption_code ~ '^M[0-9]{2}$'),
  exemption_reason text,
  -- NC/ND: linha do documento retificado {document_id, line_number} (controlo das NC parciais, Despacho 3.2.7).
  reference_line jsonb,
  constraint invoicing_document_lines_uq unique (document_id, line_number),
  constraint invoicing_document_lines_document_fk foreign key (org_id, document_id) references public.invoicing_documents (org_id, id),
  constraint invoicing_document_lines_exemption_ck check (
    (tax_code = 'ISE') = (exemption_code is not null and length(btrim(coalesce(exemption_reason, ''))) > 0)
    and (tax_code = 'ISE') = (tax_percentage = 0)
  )
);

create table if not exists public.invoicing_document_taxes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  document_id uuid not null,
  tax_region text not null check (length(tax_region) between 2 and 5),
  tax_code text not null check (tax_code in ('RED', 'INT', 'NOR', 'ISE')),
  tax_percentage numeric(7, 4) not null check (tax_percentage >= 0),
  exemption_code text check (exemption_code is null or exemption_code ~ '^M[0-9]{2}$'),
  exemption_reason text,
  taxable_base numeric(19, 2) not null check (taxable_base >= 0),
  tax_amount numeric(19, 2) not null check (tax_amount >= 0),
  constraint invoicing_document_taxes_document_fk foreign key (org_id, document_id) references public.invoicing_documents (org_id, id)
);
create index if not exists invoicing_document_taxes_document_idx on public.invoicing_document_taxes (document_id);

-- Registo fiscal append-only, escrito na mesma transação das funções (por isso
-- não usa o `audit_events` do Novo RH, que tem cadeia e numeração próprias).
create table if not exists public.invoicing_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  occurred_at timestamptz not null default clock_timestamp(),
  actor text not null check (length(actor) between 1 and 320),
  action text not null check (action ~ '^[a-z0-9_.]{3,80}$'),
  series_ref uuid,
  document_id uuid,
  reason text,
  details jsonb
);
create index if not exists invoicing_events_org_time_idx on public.invoicing_events (org_id, occurred_at desc);

-- ── Imutabilidade (triggers) ───────────────────────────────────────────────

-- Dentro das funções abaixo: sinalizador local à transação E a correr como o
-- dono da função (security definer). Um cliente com a service role não passa,
-- mesmo que ligue o sinalizador.
create or replace function public.invoicing_in_rpc() returns boolean
language sql stable as $$
  select coalesce(current_setting('invoicing.rpc', true), '') = 'on'
     and current_user not in ('anon', 'authenticated', 'service_role');
$$;

create or replace function public.invoicing_insert_only_via_rpc() returns trigger
language plpgsql as $$
begin
  if not public.invoicing_in_rpc() then
    raise exception '%: só se escreve pela emissão (fn_invoicing_issue_document)', tg_table_name;
  end if;
  return new;
end;
$$;

create or replace function public.invoicing_forbid_changes() returns trigger
language plpgsql as $$
begin
  raise exception '%: registo fiscal imutável — não se altera, apaga nem trunca', tg_table_name;
end;
$$;

create or replace function public.invoicing_documents_guard() returns trigger
language plpgsql as $$
declare
  status_cols text[] := array['status', 'status_reason', 'status_changed_at', 'status_changed_by'];
begin
  if tg_op = 'DELETE' then
    raise exception 'invoicing_documents: documentos emitidos não se apagam';
  end if;
  if not public.invoicing_in_rpc() then
    raise exception 'invoicing_documents: só as funções de emissão/anulação mudam o estado';
  end if;
  if (to_jsonb(new) - status_cols) is distinct from (to_jsonb(old) - status_cols) then
    raise exception 'invoicing_documents: dados fiscais de um documento emitido não se alteram';
  end if;
  if new.status is distinct from old.status
     and not ((old.status = 'N' and new.status = 'A')
              or (old.status = 'N' and new.status = 'F' and old.document_type = 'CM')) then
    raise exception 'invoicing_documents: transição de estado inválida (% → %)', old.status, new.status;
  end if;
  return new;
end;
$$;

create or replace function public.invoicing_series_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'invoicing_series: séries não se apagam (inibem-se)';
  end if;
  if tg_op = 'INSERT' then
    if new.last_sequence <> 0 or new.last_hash is not null or new.last_document_date is not null
       or new.last_system_entry_at is not null or new.status <> 'active' then
      raise exception 'invoicing_series: uma série nasce ativa e vazia';
    end if;
    return new;
  end if;
  if (new.org_id, new.legal_entity_id, new.location_id, new.document_type, new.series_id, new.mode, new.created_by, new.created_at)
     is distinct from (old.org_id, old.legal_entity_id, old.location_id, old.document_type, old.series_id, old.mode, old.created_by, old.created_at) then
    raise exception 'invoicing_series: a identificação da série não se altera';
  end if;
  if old.validation_code is not null and new.validation_code is distinct from old.validation_code then
    raise exception 'invoicing_series: o código de validação da AT não se altera';
  end if;
  if (new.last_sequence, new.last_hash, new.last_document_date, new.last_system_entry_at)
     is distinct from (old.last_sequence, old.last_hash, old.last_document_date, old.last_system_entry_at) then
    if not public.invoicing_in_rpc() then
      raise exception 'invoicing_series: o fim da cadeia só muda pela emissão';
    end if;
    if new.last_sequence <> old.last_sequence + 1 then
      raise exception 'invoicing_series: numeração tem de avançar de 1 em 1';
    end if;
  end if;
  if new.status is distinct from old.status and old.status <> 'active' then
    raise exception 'invoicing_series: série % não pode voltar a ficar ativa', old.status;
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' and old.last_sequence > 0 then
    raise exception 'invoicing_series: só se anula uma série sem documentos';
  end if;
  return new;
end;
$$;

drop trigger if exists invoicing_series_guard on public.invoicing_series;
create trigger invoicing_series_guard before insert or update or delete on public.invoicing_series
  for each row execute function public.invoicing_series_guard();

drop trigger if exists invoicing_documents_insert_guard on public.invoicing_documents;
create trigger invoicing_documents_insert_guard before insert on public.invoicing_documents
  for each row execute function public.invoicing_insert_only_via_rpc();
drop trigger if exists invoicing_documents_guard on public.invoicing_documents;
create trigger invoicing_documents_guard before update or delete on public.invoicing_documents
  for each row execute function public.invoicing_documents_guard();

drop trigger if exists invoicing_document_lines_insert_guard on public.invoicing_document_lines;
create trigger invoicing_document_lines_insert_guard before insert on public.invoicing_document_lines
  for each row execute function public.invoicing_insert_only_via_rpc();
drop trigger if exists invoicing_document_lines_immutable on public.invoicing_document_lines;
create trigger invoicing_document_lines_immutable before update or delete on public.invoicing_document_lines
  for each row execute function public.invoicing_forbid_changes();

drop trigger if exists invoicing_document_taxes_insert_guard on public.invoicing_document_taxes;
create trigger invoicing_document_taxes_insert_guard before insert on public.invoicing_document_taxes
  for each row execute function public.invoicing_insert_only_via_rpc();
drop trigger if exists invoicing_document_taxes_immutable on public.invoicing_document_taxes;
create trigger invoicing_document_taxes_immutable before update or delete on public.invoicing_document_taxes
  for each row execute function public.invoicing_forbid_changes();

drop trigger if exists invoicing_events_immutable on public.invoicing_events;
create trigger invoicing_events_immutable before update or delete on public.invoicing_events
  for each row execute function public.invoicing_forbid_changes();

-- TRUNCATE não dispara triggers de linha: um por tabela, ao nível da instrução.
drop trigger if exists invoicing_series_no_truncate on public.invoicing_series;
create trigger invoicing_series_no_truncate before truncate on public.invoicing_series
  for each statement execute function public.invoicing_forbid_changes();
drop trigger if exists invoicing_documents_no_truncate on public.invoicing_documents;
create trigger invoicing_documents_no_truncate before truncate on public.invoicing_documents
  for each statement execute function public.invoicing_forbid_changes();
drop trigger if exists invoicing_document_lines_no_truncate on public.invoicing_document_lines;
create trigger invoicing_document_lines_no_truncate before truncate on public.invoicing_document_lines
  for each statement execute function public.invoicing_forbid_changes();
drop trigger if exists invoicing_document_taxes_no_truncate on public.invoicing_document_taxes;
create trigger invoicing_document_taxes_no_truncate before truncate on public.invoicing_document_taxes
  for each statement execute function public.invoicing_forbid_changes();
drop trigger if exists invoicing_events_no_truncate on public.invoicing_events;
create trigger invoicing_events_no_truncate before truncate on public.invoicing_events
  for each statement execute function public.invoicing_forbid_changes();

-- ── Privilégios: o Supabase dá tudo por omissão; aqui retira-se a escrita ──
-- Séries: o backend cria e atualiza (código de validação, estado) — guardado pelo trigger.
revoke insert, update, delete, truncate on public.invoicing_series from anon, authenticated;
revoke delete, truncate on public.invoicing_series from service_role;
-- Registos fiscais: ninguém escreve diretamente; só as funções (security definer).
revoke insert, update, delete, truncate on public.invoicing_documents from anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.invoicing_document_lines from anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.invoicing_document_taxes from anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.invoicing_events from anon, authenticated;
revoke update, delete, truncate on public.invoicing_events from service_role;

-- ── Emissão (compare-and-swap na série) ────────────────────────────────────
-- A app lê a série, monta e assina o documento n+1 e chama esta função com o
-- estado em que se baseou. Bloqueia a série; se outro terminal emitiu entretanto
-- → 'stale_series' (P0001) e a app recomeça. Número, ATCUD, datas, NIF do
-- emitente, documentos referidos e somas são conferidos aqui (não se confia no
-- pedido). SourceBilling = P; HashControl = versão da chave, ou "0" enquanto o
-- programa não está certificado (Portaria 302/2016, campo 4.1.4.5).
create or replace function public.fn_invoicing_issue_document(
  p_org_id uuid,
  p_series_ref uuid,
  p_expected_last_sequence integer,
  p_expected_last_hash text,
  p_document jsonb,
  p_lines jsonb,
  p_taxes jsonb,
  p_actor text
)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_series public.invoicing_series;
  v_issuer_tax_id text;
  v_seq integer;
  v_doc_id uuid;
  v_refs jsonb := coalesce(p_document->'references_to', '[]'::jsonb);
  v_orders jsonb := coalesce(p_document->'order_references', '[]'::jsonb);
  v_ref_count integer;
  v_updated integer;
begin
  select * into v_series from public.invoicing_series
    where org_id = p_org_id and id = p_series_ref
    for update;
  if not found then
    raise exception 'series_not_found' using errcode = 'P0002';
  end if;
  if v_series.status <> 'active' then
    raise exception 'series_not_active' using errcode = 'P0003';
  end if;
  if v_series.validation_code is null then
    raise exception 'series_not_communicated' using errcode = 'P0003';
  end if;
  if v_series.last_sequence <> p_expected_last_sequence or v_series.last_hash is distinct from p_expected_last_hash then
    raise exception 'stale_series' using errcode = 'P0001';
  end if;

  v_seq := v_series.last_sequence + 1;
  if (p_document->>'sequence')::integer is distinct from v_seq
     or p_document->>'document_number' is distinct from v_series.document_type || ' ' || v_series.series_id || '/' || v_seq
     or p_document->>'atcud' is distinct from v_series.validation_code || '-' || v_seq then
    raise exception 'number_mismatch' using errcode = 'P0004';
  end if;
  if v_series.last_document_date is not null and (p_document->>'document_date')::date < v_series.last_document_date then
    raise exception 'date_before_last_in_series' using errcode = 'P0004';
  end if;
  if v_series.last_system_entry_at is not null and (p_document->>'system_entry_at')::timestamptz < v_series.last_system_entry_at then
    raise exception 'entry_before_last_in_series' using errcode = 'P0004';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'no_lines' using errcode = 'P0004';
  end if;

  select tax_id into v_issuer_tax_id from public.legal_entities
    where org_id = p_org_id and id = v_series.legal_entity_id;
  if p_document->'issuer'->>'taxId' is distinct from v_issuer_tax_id then
    raise exception 'issuer_mismatch' using errcode = 'P0004';
  end if;

  -- NC/ND retificam documentos ativos do mesmo emitente (bloqueados contra anulação concorrente).
  if v_series.document_type in ('NC', 'ND') then
    v_ref_count := jsonb_array_length(v_refs);
    if v_ref_count = 0 then
      raise exception 'references_required' using errcode = 'P0004';
    end if;
    perform 1 from public.invoicing_documents d
      where d.org_id = p_org_id
        and d.id in (select (r->>'document_id')::uuid from jsonb_array_elements(v_refs) r)
      for update;
    if (select count(*) from public.invoicing_documents d
          where d.org_id = p_org_id and d.legal_entity_id = v_series.legal_entity_id
            and d.status = 'N' and d.document_type in ('FT', 'FS', 'FR')
            and d.id in (select (r->>'document_id')::uuid from jsonb_array_elements(v_refs) r)) <> v_ref_count then
      raise exception 'invalid_reference' using errcode = 'P0003';
    end if;
  elsif jsonb_array_length(v_refs) > 0 then
    raise exception 'references_not_allowed' using errcode = 'P0004';
  end if;
  if jsonb_array_length(v_orders) > 0 and v_series.document_type not in ('FT', 'FS', 'FR') then
    raise exception 'order_references_not_allowed' using errcode = 'P0004';
  end if;

  perform set_config('invoicing.rpc', 'on', true);

  insert into public.invoicing_documents (
    org_id, series_ref, legal_entity_id, location_id, document_type, document_number, sequence,
    document_date, tax_point_date, system_entry_date, system_entry_at, software_certificate_number,
    source_billing, hash, hash_control, key_version,
    atcud, qr_payload, currency, prices_include_tax, net_total, tax_payable, gross_total, payment_mechanism,
    customer, issuer, references_to, order_references, created_by
  ) values (
    p_org_id, v_series.id, v_series.legal_entity_id, v_series.location_id, v_series.document_type,
    p_document->>'document_number', v_seq,
    (p_document->>'document_date')::date, (p_document->>'tax_point_date')::date, p_document->>'system_entry_date',
    (p_document->>'system_entry_at')::timestamptz, p_document->>'software_certificate_number',
    'P', p_document->>'hash',
    case when p_document->>'software_certificate_number' = '0' then '0' else (p_document->>'key_version')::integer::text end,
    (p_document->>'key_version')::integer, p_document->>'atcud', p_document->>'qr_payload',
    coalesce(p_document->>'currency', 'EUR'), (p_document->>'prices_include_tax')::boolean,
    (p_document->>'net_total')::numeric, (p_document->>'tax_payable')::numeric, (p_document->>'gross_total')::numeric,
    p_document->>'payment_mechanism',
    p_document->'customer', p_document->'issuer', nullif(v_refs, '[]'::jsonb), nullif(v_orders, '[]'::jsonb), p_actor
  )
  returning id into v_doc_id;

  insert into public.invoicing_document_lines (
    org_id, document_id, line_number, product_code, product_type, unit_of_measure, description, quantity,
    unit_price, discount_pct, line_amount, tax_region, tax_code, tax_percentage, exemption_code, exemption_reason,
    reference_line
  )
  select p_org_id, v_doc_id, l.line_number, l.product_code, l.product_type, l.unit_of_measure, l.description,
         l.quantity, l.unit_price, l.discount_pct, l.line_amount, l.tax_region, l.tax_code, l.tax_percentage,
         l.exemption_code, l.exemption_reason, l.reference_line
  from jsonb_to_recordset(p_lines) as l(
    line_number integer, product_code text, product_type text, unit_of_measure text, description text,
    quantity numeric, unit_price numeric, discount_pct numeric, line_amount numeric, tax_region text,
    tax_code text, tax_percentage numeric, exemption_code text, exemption_reason text, reference_line jsonb
  );

  insert into public.invoicing_document_taxes (
    org_id, document_id, tax_region, tax_code, tax_percentage, exemption_code, exemption_reason, taxable_base, tax_amount
  )
  select p_org_id, v_doc_id, t.tax_region, t.tax_code, t.tax_percentage, t.exemption_code, t.exemption_reason,
         t.taxable_base, t.tax_amount
  from jsonb_to_recordset(coalesce(p_taxes, '[]'::jsonb)) as t(
    tax_region text, tax_code text, tax_percentage numeric, exemption_code text, exemption_reason text,
    taxable_base numeric, tax_amount numeric
  );

  -- O resumo de impostos tem de bater com os totais do documento.
  if (select coalesce(sum(taxable_base), 0) from public.invoicing_document_taxes where document_id = v_doc_id)
       <> (p_document->>'net_total')::numeric
     or (select coalesce(sum(tax_amount), 0) from public.invoicing_document_taxes where document_id = v_doc_id)
       <> (p_document->>'tax_payable')::numeric then
    raise exception 'totals_mismatch' using errcode = 'P0004';
  end if;

  -- Consultas de mesa faturadas por este documento passam a «F» (todas, ou falha).
  if jsonb_array_length(v_orders) > 0 then
    update public.invoicing_documents cm
      set status = 'F', status_changed_at = now(), status_changed_by = p_actor
      where cm.org_id = p_org_id and cm.legal_entity_id = v_series.legal_entity_id
        and cm.document_type = 'CM' and cm.status = 'N'
        and cm.id in (select (r->>'document_id')::uuid from jsonb_array_elements(v_orders) r);
    get diagnostics v_updated = row_count;
    if v_updated <> jsonb_array_length(v_orders) then
      raise exception 'order_already_invoiced' using errcode = 'P0003';
    end if;
  end if;

  update public.invoicing_series
    set last_sequence = v_seq,
        last_hash = p_document->>'hash',
        last_document_date = (p_document->>'document_date')::date,
        last_system_entry_at = (p_document->>'system_entry_at')::timestamptz
    where id = v_series.id;

  insert into public.invoicing_events (org_id, actor, action, series_ref, document_id)
    values (p_org_id, p_actor, 'document.issued', v_series.id, v_doc_id);

  perform set_config('invoicing.rpc', 'off', true);
  return v_doc_id;
end;
$function$;

-- ── Anulação (estado A com motivo) ─────────────────────────────────────────
-- Não anula documentos já anulados/faturados nem com NC/ND ativa a retificá-los
-- (Despacho 3.3.8: anula-se primeiro a retificação).
create or replace function public.fn_invoicing_cancel_document(
  p_org_id uuid,
  p_document_id uuid,
  p_reason text,
  p_actor text
)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_doc public.invoicing_documents;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required' using errcode = 'P0004';
  end if;
  select * into v_doc from public.invoicing_documents
    where org_id = p_org_id and id = p_document_id
    for update;
  if not found then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'N' then
    raise exception 'not_cancellable' using errcode = 'P0003';
  end if;
  if exists (
    select 1 from public.invoicing_documents d
    where d.org_id = p_org_id and d.status = 'N'
      and d.references_to @> jsonb_build_array(jsonb_build_object('document_id', p_document_id::text))
  ) then
    raise exception 'has_active_rectifications' using errcode = 'P0003';
  end if;

  perform set_config('invoicing.rpc', 'on', true);
  update public.invoicing_documents
    set status = 'A', status_reason = btrim(p_reason), status_changed_at = now(), status_changed_by = p_actor
    where id = p_document_id;
  insert into public.invoicing_events (org_id, actor, action, document_id, reason)
    values (p_org_id, p_actor, 'document.cancelled', p_document_id, btrim(p_reason));
  perform set_config('invoicing.rpc', 'off', true);
end;
$function$;

revoke all on function public.fn_invoicing_issue_document(uuid, uuid, integer, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.fn_invoicing_issue_document(uuid, uuid, integer, text, jsonb, jsonb, jsonb, text) to service_role;
revoke all on function public.fn_invoicing_cancel_document(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_invoicing_cancel_document(uuid, uuid, text, text) to service_role;

-- ── RLS: leitura por organização; escrita só pelo backend ──────────────────

alter table public.invoicing_series enable row level security;
drop policy if exists "invoicing_series: org-scoped read" on public.invoicing_series;
create policy "invoicing_series: org-scoped read" on public.invoicing_series
  for select to authenticated using (org_id = current_org());

alter table public.invoicing_documents enable row level security;
drop policy if exists "invoicing_documents: org-scoped read" on public.invoicing_documents;
create policy "invoicing_documents: org-scoped read" on public.invoicing_documents
  for select to authenticated using (org_id = current_org());

alter table public.invoicing_document_lines enable row level security;
drop policy if exists "invoicing_document_lines: org-scoped read" on public.invoicing_document_lines;
create policy "invoicing_document_lines: org-scoped read" on public.invoicing_document_lines
  for select to authenticated using (org_id = current_org());

alter table public.invoicing_document_taxes enable row level security;
drop policy if exists "invoicing_document_taxes: org-scoped read" on public.invoicing_document_taxes;
create policy "invoicing_document_taxes: org-scoped read" on public.invoicing_document_taxes
  for select to authenticated using (org_id = current_org());

alter table public.invoicing_events enable row level security;
drop policy if exists "invoicing_events: org-scoped read" on public.invoicing_events;
create policy "invoicing_events: org-scoped read" on public.invoicing_events
  for select to authenticated using (org_id = current_org());
