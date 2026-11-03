-- Faturação certificada AT — módulo `invoicing`, F2 (.scratch/certificacao-at/).
-- Séries, documentos emitidos (assinados), linhas, resumo de impostos e
-- eventos. Regras impostas na própria BD, que valem também para a service
-- role (Portaria 363/2010 art. 3.º d); Despacho 8632/2014 1.9, 1.11, 2.1;
-- DL 28/2019 arts. 7.º e 11.º):
--   * documentos, linhas e impostos só entram pela RPC de emissão;
--   * nada se apaga; documentos só mudam de estado (N→A com motivo, CM N→F);
--   * o fim da cadeia da série só muda pela emissão (compare-and-swap).
-- A assinatura RSA é feita na aplicação (a chave privada nunca entra na BD).
-- Só cria objetos novos; rollback em docs/migrations/rollback/.

-- ── Tabelas ────────────────────────────────────────────────────────────────

create table if not exists public.invoicing_series (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  legal_entity_id uuid not null,
  location_id uuid,
  document_type text not null check (document_type in ('FT', 'FS', 'FR', 'NC', 'ND', 'CM', 'RC')),
  series_id text not null check (
    length(series_id) between 1 and 35
    and series_id ~ '^[A-Za-z0-9]+([._-][A-Za-z0-9]+)*$'
    and upper(series_id) not like 'AT%'
  ),
  mode text not null check (mode in ('normal', 'training', 'recovery')),
  status text not null default 'active' check (status in ('active', 'finalized', 'cancelled')),
  validation_code text check (validation_code is null or (length(validation_code) >= 8 and validation_code !~ '[[:space:]*-]')),
  last_sequence integer not null default 0 check (last_sequence >= 0),
  last_hash text,
  last_document_date date,
  last_system_entry_date text check (last_system_entry_date is null or last_system_entry_date ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'),
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
  system_entry_date text not null check (system_entry_date ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'),
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
  -- Cópias fiéis à data de emissão (2.ª via com os dados originais, Despacho 2.2.15).
  customer jsonb not null,
  issuer jsonb not null,
  -- NC/ND: documentos retificados [{document_id, document_number, reason}] (Despacho 1.4).
  references_to jsonb,
  -- Fatura de consultas de mesa: [{document_id, document_number}] (Despacho 1.3).
  order_references jsonb,
  status text not null default 'N' check (status in ('N', 'A', 'F')),
  status_reason text,
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
create index if not exists invoicing_documents_entity_entry_idx on public.invoicing_documents (org_id, legal_entity_id, system_entry_date desc);

create table if not exists public.invoicing_document_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  document_id uuid not null,
  line_number integer not null check (line_number >= 1),
  product_code text,
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

-- Registo append-only do que acontece aos documentos e séries.
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

-- ── Imutabilidade (triggers; valem também para a service role) ─────────────

-- Sinalizador local à transação, ligado só dentro das RPC abaixo.
create or replace function public.invoicing_in_rpc() returns boolean
language sql stable as $$
  select coalesce(current_setting('invoicing.rpc', true), '') = 'on';
$$;

create or replace function public.invoicing_insert_only_via_rpc() returns trigger
language plpgsql as $$
begin
  if not public.invoicing_in_rpc() then
    raise exception '%: só se escreve pela emissão (invoicing_issue_document)', tg_table_name;
  end if;
  return new;
end;
$$;

create or replace function public.invoicing_forbid_changes() returns trigger
language plpgsql as $$
begin
  raise exception '%: registo fiscal imutável — não se altera nem apaga', tg_table_name;
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
    raise exception 'invoicing_documents: só a anulação (invoicing_cancel_document) muda o estado';
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
  if (new.org_id, new.legal_entity_id, new.location_id, new.document_type, new.series_id, new.mode, new.created_by, new.created_at)
     is distinct from (old.org_id, old.legal_entity_id, old.location_id, old.document_type, old.series_id, old.mode, old.created_by, old.created_at) then
    raise exception 'invoicing_series: a identificação da série não se altera';
  end if;
  if old.validation_code is not null and new.validation_code is distinct from old.validation_code then
    raise exception 'invoicing_series: o código de validação da AT não se altera';
  end if;
  if (new.last_sequence, new.last_hash, new.last_document_date, new.last_system_entry_date)
     is distinct from (old.last_sequence, old.last_hash, old.last_document_date, old.last_system_entry_date) then
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
create trigger invoicing_series_guard before update or delete on public.invoicing_series
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

-- ── Emissão (compare-and-swap na série) ────────────────────────────────────
-- A app lê a série, monta e assina o documento n+1 e chama esta função com o
-- estado em que se baseou. Bloqueia a série; se outro terminal emitiu entretanto
-- → 'stale_series' (P0001) e a app recomeça. Número, ATCUD e datas são
-- conferidos aqui contra a série (não se confia no pedido).
create or replace function public.invoicing_issue_document(
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
  v_seq integer;
  v_doc_id uuid;
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
  if v_series.last_system_entry_date is not null and p_document->>'system_entry_date' < v_series.last_system_entry_date then
    raise exception 'entry_before_last_in_series' using errcode = 'P0004';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'no_lines' using errcode = 'P0004';
  end if;

  perform set_config('invoicing.rpc', 'on', true);

  insert into public.invoicing_documents (
    org_id, series_ref, legal_entity_id, location_id, document_type, document_number, sequence,
    document_date, tax_point_date, system_entry_date, source_billing, hash, hash_control, key_version,
    atcud, qr_payload, currency, prices_include_tax, net_total, tax_payable, gross_total,
    customer, issuer, references_to, order_references, created_by
  ) values (
    p_org_id, v_series.id, v_series.legal_entity_id, v_series.location_id, v_series.document_type,
    p_document->>'document_number', v_seq,
    (p_document->>'document_date')::date, (p_document->>'tax_point_date')::date, p_document->>'system_entry_date',
    coalesce(p_document->>'source_billing', 'P'), p_document->>'hash', p_document->>'hash_control',
    (p_document->>'key_version')::integer, p_document->>'atcud', p_document->>'qr_payload',
    coalesce(p_document->>'currency', 'EUR'), (p_document->>'prices_include_tax')::boolean,
    (p_document->>'net_total')::numeric, (p_document->>'tax_payable')::numeric, (p_document->>'gross_total')::numeric,
    p_document->'customer', p_document->'issuer', p_document->'references_to', p_document->'order_references', p_actor
  )
  returning id into v_doc_id;

  insert into public.invoicing_document_lines (
    org_id, document_id, line_number, product_code, description, quantity, unit_price, discount_pct,
    line_amount, tax_region, tax_code, tax_percentage, exemption_code, exemption_reason
  )
  select p_org_id, v_doc_id, l.line_number, l.product_code, l.description, l.quantity, l.unit_price, l.discount_pct,
         l.line_amount, l.tax_region, l.tax_code, l.tax_percentage, l.exemption_code, l.exemption_reason
  from jsonb_to_recordset(p_lines) as l(
    line_number integer, product_code text, description text, quantity numeric, unit_price numeric,
    discount_pct numeric, line_amount numeric, tax_region text, tax_code text, tax_percentage numeric,
    exemption_code text, exemption_reason text
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

  -- Consultas de mesa faturadas por este documento passam a «F».
  update public.invoicing_documents cm
    set status = 'F', status_changed_at = now(), status_changed_by = p_actor
    where cm.org_id = p_org_id and cm.document_type = 'CM' and cm.status = 'N'
      and cm.id in (select (r->>'document_id')::uuid from jsonb_array_elements(coalesce(p_document->'order_references', '[]'::jsonb)) r);

  update public.invoicing_series
    set last_sequence = v_seq,
        last_hash = p_document->>'hash',
        last_document_date = (p_document->>'document_date')::date,
        last_system_entry_date = p_document->>'system_entry_date'
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
create or replace function public.invoicing_cancel_document(
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

revoke all on function public.invoicing_issue_document(uuid, uuid, integer, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.invoicing_issue_document(uuid, uuid, integer, text, jsonb, jsonb, jsonb, text) to service_role;
revoke all on function public.invoicing_cancel_document(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.invoicing_cancel_document(uuid, uuid, text, text) to service_role;

-- ── RLS: leitura por organização; escrita só pelo backend (service role/RPC) ─

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
