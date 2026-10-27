-- Faturas por email (Resend Inbound): cada empresa recebe faturas num endereço exclusivo e renovável;
-- os PDFs entram pelo mesmo import das faturas (rascunho «Por rever») ou, para quem só usa o Stock,
-- pelo import do Stock («Compras por rever»). Receber nunca confirma, paga nem mexe no stock.
--  * invoice_inbound_addresses: endereços por empresa (um só ativo; os antigos ficam no histórico).
--  * invoice_email_intake_settings: destino por empresa (finance | stock).
--  * inbound_email_events: eventos do webhook — tabela TÉCNICA sem org_id (exceção à convenção): a
--    idempotência tem de existir antes de se saber a empresa e os emails para endereços desconhecidos não
--    têm empresa. Só o service role lhe acede (RLS ativa sem políticas). Sem remetente nem conteúdo.
--  * invoice_inbound_attachments: um registo por anexo, com o estado do processamento.
--  * invoices.intake_source: 'email' quando a fatura chegou por email.
--  * fn_rotate_invoice_inbound_address: desativa o endereço ativo e cria o novo na mesma transação.
-- Idempotente. Rollback: docs/migrations/rollback/20261203100000_invoice_email_intake.sql

create table if not exists public.invoice_inbound_addresses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  local_part text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  created_by text null,
  deactivated_at timestamptz null,
  deactivated_by text null,
  deactivation_reason text null,
  constraint invoice_inbound_addresses_local_part_key unique (local_part),
  constraint invoice_inbound_addresses_org_id_id_key unique (org_id, id),
  constraint invoice_inbound_addresses_status_check check (status in ('active', 'inactive')),
  constraint invoice_inbound_addresses_local_part_check check (local_part ~ '^[a-z0-9]{12,40}$')
);

create unique index if not exists uq_invoice_inbound_addresses_one_active
  on public.invoice_inbound_addresses (org_id)
  where status = 'active';

alter table public.invoice_inbound_addresses enable row level security;
drop policy if exists "invoice_inbound_addresses: org-scoped all" on public.invoice_inbound_addresses;
create policy "invoice_inbound_addresses: org-scoped all"
  on public.invoice_inbound_addresses
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

create table if not exists public.invoice_email_intake_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  destination text not null default 'finance',
  updated_by text null,
  updated_at timestamptz not null default now(),
  constraint invoice_email_intake_settings_org_key unique (org_id),
  constraint invoice_email_intake_settings_destination_check check (destination in ('finance', 'stock'))
);

alter table public.invoice_email_intake_settings enable row level security;
drop policy if exists "invoice_email_intake_settings: org-scoped all" on public.invoice_email_intake_settings;
create policy "invoice_email_intake_settings: org-scoped all"
  on public.invoice_email_intake_settings
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

create table if not exists public.inbound_email_events (
  id uuid primary key default gen_random_uuid(),
  webhook_id text not null,
  email_id text not null,
  received_at timestamptz not null,
  org_id uuid null references public.organizations(id),
  address_id uuid null,
  status text not null default 'received',
  reason text null,
  attachments_total integer not null default 0,
  attachments_accepted integer not null default 0,
  created_at timestamptz not null default now(),
  constraint inbound_email_events_webhook_id_key unique (webhook_id),
  constraint inbound_email_events_email_id_key unique (email_id),
  constraint inbound_email_events_status_check check (status in ('received', 'accepted', 'quarantined', 'ignored'))
);

-- Só o service role (sem políticas = nenhum acesso por anon/authenticated).
alter table public.inbound_email_events enable row level security;

create table if not exists public.invoice_inbound_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  event_id uuid not null references public.inbound_email_events(id),
  address_id uuid not null,
  email_id text not null,
  attachment_id text not null,
  filename text not null,
  content_type text null,
  size_bytes bigint null,
  sender text null,
  received_at timestamptz not null,
  destination text not null,
  status text not null default 'received',
  invoice_id uuid null,
  file_sha256 text null,
  error_code text null,
  error_message text null,
  attempts integer not null default 0,
  next_attempt_at timestamptz null,
  locked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_inbound_attachments_email_attachment_key unique (email_id, attachment_id),
  constraint invoice_inbound_attachments_destination_check check (destination in ('finance', 'stock')),
  constraint invoice_inbound_attachments_status_check
    check (status in ('received', 'processing', 'imported', 'duplicate', 'read_error', 'rejected'))
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_inbound_attachments_org_id_address_id_fkey') then
    alter table public.invoice_inbound_attachments
      add constraint invoice_inbound_attachments_org_id_address_id_fkey
      foreign key (org_id, address_id) references public.invoice_inbound_addresses (org_id, id);
  end if;
end $$;

create index if not exists idx_invoice_inbound_attachments_org_created
  on public.invoice_inbound_attachments (org_id, created_at desc);
create index if not exists idx_invoice_inbound_attachments_pending
  on public.invoice_inbound_attachments (status, next_attempt_at)
  where status in ('received', 'processing', 'read_error');

alter table public.invoice_inbound_attachments enable row level security;
drop policy if exists "invoice_inbound_attachments: org-scoped all" on public.invoice_inbound_attachments;
create policy "invoice_inbound_attachments: org-scoped all"
  on public.invoice_inbound_attachments
  for all
  to authenticated
  using (org_id = current_org())
  with check (org_id = current_org());

alter table public.invoices
  add column if not exists intake_source text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_intake_source_check') then
    alter table public.invoices
      add constraint invoices_intake_source_check check (intake_source is null or intake_source in ('email'));
  end if;
end $$;

-- Rotação atómica: bloqueia os endereços da empresa, desativa o ativo e cria o novo. Dois pedidos ao mesmo
-- tempo ficam em fila (o segundo desativa o criado pelo primeiro). Só o service role a executa (ao
-- contrário dos RPCs antigos, sem grant a anon/authenticated: p_org_id não pode vir de quem chama).
create or replace function public.fn_rotate_invoice_inbound_address(
  p_org_id uuid,
  p_local_part text,
  p_actor text,
  p_reason text
)
  returns table (id uuid, local_part text, created_at timestamptz)
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
begin
  perform pg_advisory_xact_lock(hashtext('invoice_inbound_address:' || p_org_id::text));

  update public.invoice_inbound_addresses a
     set status = 'inactive',
         deactivated_at = now(),
         deactivated_by = p_actor,
         deactivation_reason = p_reason
   where a.org_id = p_org_id
     and a.status = 'active';

  return query
    insert into public.invoice_inbound_addresses as n (org_id, local_part, status, created_by)
    values (p_org_id, p_local_part, 'active', p_actor)
    returning n.id, n.local_part, n.created_at;
end;
$function$;

revoke all on function public.fn_rotate_invoice_inbound_address(uuid, text, text, text) from public, "anon", "authenticated";
grant execute on function public.fn_rotate_invoice_inbound_address(uuid, text, text, text) to "service_role";

comment on table public.invoice_inbound_addresses is 'Faturas por email: endereços de receção por empresa (um ativo; os inativos ficam como histórico).';
comment on table public.invoice_email_intake_settings is 'Faturas por email: destino por empresa (finance = Faturas por rever; stock = Compras por rever).';
comment on table public.inbound_email_events is 'Faturas por email: eventos do webhook da Resend (idempotência e quarentena). Tabela técnica, só service role.';
comment on table public.invoice_inbound_attachments is 'Faturas por email: um registo por anexo PDF recebido, com o estado do processamento.';
comment on column public.invoices.intake_source is 'email = fatura recebida por email (Faturas por email).';
