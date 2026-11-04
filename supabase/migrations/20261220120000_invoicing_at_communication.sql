-- Faturação certificada AT — F6: comunicação à AT por webservice (ambiente de testes).
--
--   invoicing_at_communications  registo append-only de cada envio ao e-Fatura
--                                (registo ou mudança de estado) e da resposta;
--                                é também a «outbox»: o que falta comunicar
--                                deriva dele (fn_invoicing_at_queue).
--   invoicing_at_credentials     subutilizador WFA de cada emitente, com a senha
--                                cifrada pelo backend (AES-256-GCM); nunca lido
--                                pelo browser.
--
-- Idempotente. Rollback: docs/migrations/rollback/20261220120000_invoicing_at_communication.sql

create table if not exists public.invoicing_at_communications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  document_id uuid not null,
  environment text not null check (environment in ('test', 'production')),
  operation text not null check (operation in ('register', 'change-status')),
  -- Estado do documento que foi comunicado (N, A ou F).
  document_status text not null check (document_status in ('N', 'A', 'F')),
  -- accepted: registado/alterado (ou já registado, -10); rejected: dados recusados;
  -- auth: credenciais recusadas; failed: AT ou rede indisponível (volta a tentar).
  outcome text not null check (outcome in ('accepted', 'rejected', 'auth', 'failed')),
  response_code integer,
  response_message text check (response_message is null or length(response_message) <= 1000),
  actor text not null check (length(actor) between 1 and 320),
  created_at timestamptz not null default clock_timestamp(),
  constraint invoicing_at_communications_document_fk foreign key (org_id, document_id) references public.invoicing_documents (org_id, id)
);
create index if not exists invoicing_at_communications_document_idx
  on public.invoicing_at_communications (org_id, document_id, environment, created_at desc);

create table if not exists public.invoicing_at_credentials (
  org_id uuid not null references public.organizations(id),
  legal_entity_id uuid not null,
  environment text not null check (environment in ('test', 'production')),
  -- <NIF do emitente>/<n.º do subutilizador> (perfil WFA).
  username text not null check (username ~ '^[0-9]{9}/[0-9]{1,4}$'),
  password_encrypted text not null check (length(password_encrypted) between 16 and 2000),
  updated_by text not null check (length(updated_by) between 1 and 320),
  updated_at timestamptz not null default now(),
  primary key (org_id, legal_entity_id, environment),
  constraint invoicing_at_credentials_legal_entity_fk foreign key (org_id, legal_entity_id) references public.legal_entities (org_id, id)
);

-- O registo de comunicações não se altera nem se apaga (prova do que foi enviado).
drop trigger if exists invoicing_at_communications_immutable on public.invoicing_at_communications;
create trigger invoicing_at_communications_immutable before update or delete on public.invoicing_at_communications
  for each row execute function public.invoicing_forbid_changes();
drop trigger if exists invoicing_at_communications_no_truncate on public.invoicing_at_communications;
create trigger invoicing_at_communications_no_truncate before truncate on public.invoicing_at_communications
  for each statement execute function public.invoicing_forbid_changes();

-- ── Privilégios ─────────────────────────────────────────────────────────────
revoke insert, update, delete, truncate on public.invoicing_at_communications from anon, authenticated;
revoke update, delete, truncate on public.invoicing_at_communications from service_role;
-- Credenciais: só o backend (service role) — nem leitura pelo browser.
revoke all on public.invoicing_at_credentials from anon, authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.invoicing_at_communications enable row level security;
drop policy if exists "invoicing_at_communications: org-scoped read" on public.invoicing_at_communications;
create policy "invoicing_at_communications: org-scoped read" on public.invoicing_at_communications
  for select to authenticated using (org_id = current_org());

-- Sem políticas: com RLS ativo e sem política, anon/authenticated não veem nada.
alter table public.invoicing_at_credentials enable row level security;

-- ── Fila: documentos cujo estado atual ainda não foi aceite pela AT ─────────
-- Em produção só entram séries normais; no ambiente de testes também as de formação.
create or replace function public.fn_invoicing_at_queue(p_org_id uuid, p_environment text, p_limit integer)
returns table (
  document_id uuid,
  legal_entity_id uuid,
  document_number text,
  document_type text,
  document_date date,
  status text,
  series_mode text,
  accepted_status text,
  failures integer,
  last_attempt_at timestamptz,
  last_outcome text,
  last_code integer,
  last_message text
)
language sql
stable
security invoker
set search_path = public
as $$
  select d.id, d.legal_entity_id, d.document_number, d.document_type, d.document_date, d.status, d.series_mode,
         acc.document_status, coalesce(att.failures, 0), lst.created_at, lst.outcome, lst.response_code, lst.response_message
  from public.invoicing_documents d
  left join lateral (
    select c.document_status, c.created_at
    from public.invoicing_at_communications c
    where c.org_id = p_org_id and c.document_id = d.id and c.environment = p_environment and c.outcome = 'accepted'
    order by c.created_at desc
    limit 1
  ) acc on true
  left join lateral (
    select count(*)::integer as failures
    from public.invoicing_at_communications c
    where c.org_id = p_org_id and c.document_id = d.id and c.environment = p_environment and c.outcome <> 'accepted'
      and (acc.created_at is null or c.created_at > acc.created_at)
  ) att on true
  left join lateral (
    select c.created_at, c.outcome, c.response_code, c.response_message
    from public.invoicing_at_communications c
    where c.org_id = p_org_id and c.document_id = d.id and c.environment = p_environment
    order by c.created_at desc
    limit 1
  ) lst on true
  where d.org_id = p_org_id
    and (p_environment = 'test' or d.series_mode = 'normal')
    and acc.document_status is distinct from d.status
  order by d.system_entry_at, d.id
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

revoke all on function public.fn_invoicing_at_queue(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.fn_invoicing_at_queue(uuid, text, integer) to service_role;
