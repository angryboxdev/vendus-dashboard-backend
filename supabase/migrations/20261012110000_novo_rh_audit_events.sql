-- Novo RH — Fase 1, ticket 03: auditoria transversal append-only (task §4.2;
-- Engenharia Reversa 12.5 e 13.1 `audit_log`). Quem, quando, o quê, antes,
-- depois, motivo, IP, dispositivo; encadeada por hash por organização.
-- Só cria objetos novos; rollback em docs/migrations/rollback/.

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  seq bigint not null,
  occurred_at timestamptz not null default clock_timestamp(),
  actor text not null check (length(actor) between 1 and 320),
  action text not null check (action ~ '^[a-z0-9_.]{3,80}$'),
  resource_type text not null check (resource_type ~ '^[a-z0-9_.]{2,80}$'),
  resource_id text,
  before jsonb,
  after jsonb,
  reason text,
  ip text,
  user_agent text check (user_agent is null or length(user_agent) <= 400),
  correlation_id text,
  prev_hash text,
  hash text not null,
  constraint audit_events_org_seq_key unique (org_id, seq)
);
create index if not exists audit_events_org_resource_idx on public.audit_events (org_id, resource_type, resource_id, seq desc);
create index if not exists audit_events_org_time_idx on public.audit_events (org_id, occurred_at desc);

-- Texto canónico de um evento para o hash (o mesmo na escrita e na verificação).
create or replace function public.audit_event_digest(
  p_org uuid, p_seq bigint, p_at timestamptz, p_actor text, p_action text, p_rtype text, p_rid text,
  p_before jsonb, p_after jsonb, p_reason text, p_ip text, p_ua text, p_corr text, p_prev text
) returns text
language sql immutable as $$
  select encode(sha256(convert_to(concat_ws('|',
    p_org::text, p_seq::text, to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    p_actor, p_action, p_rtype, coalesce(p_rid, ''),
    coalesce(p_before::text, ''), coalesce(p_after::text, ''), coalesce(p_reason, ''),
    coalesce(p_ip, ''), coalesce(p_ua, ''), coalesce(p_corr, ''), coalesce(p_prev, '')
  ), 'UTF8')), 'hex');
$$;

-- Numeração e hash calculados aqui (o cliente não escolhe seq, data nem hash).
create or replace function public.audit_events_chain() returns trigger
language plpgsql as $$
declare
  last_seq bigint;
  last_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended('audit_events:' || new.org_id::text, 0));
  select seq, hash into last_seq, last_hash
    from public.audit_events where org_id = new.org_id order by seq desc limit 1;
  new.seq := coalesce(last_seq, 0) + 1;
  new.prev_hash := last_hash;
  new.occurred_at := clock_timestamp();
  new.hash := public.audit_event_digest(new.org_id, new.seq, new.occurred_at, new.actor, new.action, new.resource_type,
    new.resource_id, new.before, new.after, new.reason, new.ip, new.user_agent, new.correlation_id, new.prev_hash);
  return new;
end;
$$;

drop trigger if exists audit_events_chain on public.audit_events;
create trigger audit_events_chain before insert on public.audit_events
  for each row execute function public.audit_events_chain();

create or replace function public.forbid_audit_event_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_events é append-only: não se altera nem apaga';
end;
$$;

drop trigger if exists audit_events_append_only on public.audit_events;
create trigger audit_events_append_only before update or delete on public.audit_events
  for each row execute function public.forbid_audit_event_changes();

-- Verificação da cadeia: devolve o primeiro seq quebrado (null = íntegra).
create or replace function public.verify_audit_chain(p_org uuid) returns bigint
language plpgsql stable as $$
declare
  r record;
  expected_prev text := null;
  expected_seq bigint := 1;
begin
  for r in select * from public.audit_events where org_id = p_org order by seq loop
    if r.seq <> expected_seq or r.prev_hash is distinct from expected_prev
       or r.hash <> public.audit_event_digest(r.org_id, r.seq, r.occurred_at, r.actor, r.action, r.resource_type,
            r.resource_id, r.before, r.after, r.reason, r.ip, r.user_agent, r.correlation_id, r.prev_hash) then
      return r.seq;
    end if;
    expected_prev := r.hash;
    expected_seq := r.seq + 1;
  end loop;
  return null;
end;
$$;

alter table public.audit_events enable row level security;
drop policy if exists "audit_events: org-scoped read" on public.audit_events;
create policy "audit_events: org-scoped read" on public.audit_events
  for select to authenticated using (org_id = current_org());
drop policy if exists "audit_events: org-scoped insert" on public.audit_events;
create policy "audit_events: org-scoped insert" on public.audit_events
  for insert to authenticated with check (org_id = current_org());
